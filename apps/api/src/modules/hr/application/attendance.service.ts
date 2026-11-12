import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type {
  AttendanceDayDto,
  AttendanceImportDto,
  AttendanceImportResultDto,
  AttendanceQueryDto,
  AttendanceStatusDto,
  AttendanceSummaryRowDto,
  RebuildAttendanceDto,
  RebuildAttendanceResultDto,
  UpdateAttendanceDayDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { withTransaction } from '../../../database/tenant/transaction.util';
import { AppSettingsRepository } from '../../../shared/app-settings/app-settings.repository';
import { BusinessRuleError } from '../../../shared/errors/domain-errors';
import { entityNotFound } from '../../../shared/errors/entity-errors';
import {
  addDays,
  dayKind,
  daysBetween,
  evaluateDay,
  measure,
  punchWindow,
  type DayResult,
  type ShiftRule,
} from '../domain/attendance';
import { parsePunch } from '../domain/punch-parse';

const MAX_RANGE_DAYS = 366;
const CHUNK = 500;

/**
 * Attendance (الحضور والانصراف): punches imported from any fingerprint device's export, turned into a
 * daily sheet per employee (present / absent / weekend / holiday, late, early leave, overtime).
 * Days corrected by hand are kept through every rebuild. Payroll (a later step) reads the summary.
 */
@Injectable()
export class AttendanceService {
  constructor(private readonly settings: AppSettingsRepository) {}

  async import(db: Kysely<TenantDatabase>, input: AttendanceImportDto, userId: string | null): Promise<AttendanceImportResultDto> {
    const employees = await db.selectFrom('employees').select(['id', 'code', 'attendance_code']).execute();
    const byKey = new Map<string, string>();
    // The device number wins over the employee code when both could match.
    for (const e of employees) byKey.set(normaliseKey(e.code), e.id);
    for (const e of employees) if (e.attendance_code) byKey.set(normaliseKey(e.attendance_code), e.id);

    const punches = new Map<string, { employeeId: string; at: string; date: string }>();
    const unmatched = new Set<string>();
    const invalidRows: number[] = [];
    let unmatchedRows = 0;
    input.rows.forEach((row, index) => {
      const employeeId = byKey.get(normaliseKey(row.employeeKey));
      if (!employeeId) {
        if (row.employeeKey.trim()) unmatched.add(row.employeeKey.trim());
        unmatchedRows += 1;
        return;
      }
      const parsed = parsePunch(row.date, row.time, input.dateFormat);
      if (!parsed) {
        if (invalidRows.length < 50) invalidRows.push(index + 1);
        return;
      }
      const at = `${parsed.date} ${pad(Math.floor(parsed.minute / 60))}:${pad(parsed.minute % 60)}:00`;
      punches.set(`${employeeId}|${at}`, { employeeId, at, date: parsed.date });
    });

    const all = [...punches.values()];
    let imported = 0;
    await withTransaction(db, async (trx) => {
      const importId = randomUUID();
      await trx
        .insertInto('hr_attendance_imports')
        .values({ id: importId, file_name: input.fileName || '—', rows_total: input.rows.length, rows_imported: 0, imported_by: userId })
        .execute();
      for (let i = 0; i < all.length; i += CHUNK) {
        const inserted = await trx
          .insertInto('hr_attendance_punches')
          .values(all.slice(i, i + CHUNK).map((p) => ({ id: randomUUID(), employee_id: p.employeeId, punched_at: p.at, import_id: importId })))
          .onConflict((oc) => oc.constraint('hr_attendance_punches_unique').doNothing())
          .returning('id')
          .execute();
        imported += inserted.length;
      }
      await trx.updateTable('hr_attendance_imports').set({ rows_imported: imported }).where('id', '=', importId).execute();
    });

    const dates = all.map((p) => p.date).sort();
    const from = dates[0] ?? null;
    const to = dates[dates.length - 1] ?? null;
    let days = 0;
    if (from && to) {
      // A punch early in the morning may close the previous day's night shift.
      const start = addDays(from, -1);
      const end = to < today() ? to : today();
      const employeeIds = [...new Set(all.map((p) => p.employeeId))];
      for (let s = start; s <= end; s = addDays(s, MAX_RANGE_DAYS)) {
        const e = addDays(s, MAX_RANGE_DAYS - 1);
        days += (await this.rebuild(db, { from: s, to: e < end ? e : end, employeeIds })).days;
      }
    }
    return {
      rowsTotal: input.rows.length,
      imported,
      duplicates: all.length - imported,
      unmatchedKeys: [...unmatched].slice(0, 100),
      unmatchedRows,
      invalidRows,
      from,
      to,
      days,
    };
  }

  /** Recomputes the sheet for a period from the punches; hand-corrected days stay as they are. */
  async rebuild(db: Kysely<TenantDatabase>, input: RebuildAttendanceDto): Promise<RebuildAttendanceResultDto> {
    const to = input.to < today() ? input.to : today();
    const from = input.from;
    if (from > to) return { days: 0, keptManual: 0 };
    assertRange(from, to);

    let employeesQuery = db
      .selectFrom('employees')
      .select(['id', 'hire_date', 'termination_date', 'shift_id'])
      .where('status', '<>', 'suspended')
      .where('hire_date', '<=', to)
      .where((eb) => eb.or([eb('termination_date', 'is', null), eb('termination_date', '>=', from)]));
    if (input.employeeIds) {
      if (input.employeeIds.length === 0) return { days: 0, keptManual: 0 };
      employeesQuery = employeesQuery.where('id', 'in', input.employeeIds);
    }
    const employees = await employeesQuery.execute();
    if (employees.length === 0) return { days: 0, keptManual: 0 };

    const shifts = await db.selectFrom('hr_shifts').selectAll().execute();
    const fallback = shifts.find((s) => s.is_default) ?? shifts[0];
    if (!fallback) throw new BusinessRuleError('Define a shift first.', { code: 'HR_SHIFT.DEFAULT_REQUIRED' });
    const ruleOf = new Map(shifts.map((s) => [s.id, toRule(s)]));
    const holidays = new Set(
      (await db.selectFrom('hr_public_holidays').select('holiday_date').where('holiday_date', '>=', from).where('holiday_date', '<=', to).execute()).map(
        (h) => h.holiday_date,
      ),
    );
    const minOvertime = await this.settings.get(db, 'hr.minOvertimeMinutes');

    // Punches by employee and calendar date, as minutes after that date's midnight.
    const punchRows = await db
      .selectFrom('hr_attendance_punches')
      .select([
        'employee_id',
        sql<string>`to_char(punched_at, 'YYYY-MM-DD')`.as('day'),
        sql<number>`(extract(hour from punched_at) * 60 + extract(minute from punched_at))::int`.as('minute'),
      ])
      .where('employee_id', 'in', employees.map((e) => e.id))
      .where('punched_at', '>=', `${addDays(from, -1)} 00:00:00`)
      .where('punched_at', '<', `${addDays(to, 2)} 00:00:00`)
      .execute();
    const punchMap = new Map<string, number[]>();
    for (const p of punchRows) {
      const key = `${p.employee_id}|${p.day}`;
      punchMap.set(key, [...(punchMap.get(key) ?? []), Number(p.minute)]);
    }

    const rows: (DayResult & { employeeId: string; workDate: string })[] = [];
    for (const e of employees) {
      const rule = ruleOf.get(e.shift_id ?? '') ?? toRule(fallback);
      const window = punchWindow(rule);
      const start = e.hire_date > from ? e.hire_date : from;
      const end = e.termination_date && e.termination_date < to ? e.termination_date : to;
      for (let date = start; date <= end; date = addDays(date, 1)) {
        const minutes: number[] = [];
        for (const offset of [-1, 0, 1]) {
          for (const m of punchMap.get(`${e.id}|${addDays(date, offset)}`) ?? []) {
            const relative = offset * 1440 + m;
            if (relative >= window.from && relative < window.to) minutes.push(relative);
          }
        }
        rows.push({ employeeId: e.id, workDate: date, ...evaluateDay(dayKind(date, rule, holidays), rule, minutes, minOvertime) });
      }
    }

    const keptManual = Number(
      (
        await db
          .selectFrom('hr_attendance_days')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('employee_id', 'in', employees.map((e) => e.id))
          .where('work_date', '>=', from)
          .where('work_date', '<=', to)
          .where('is_manual', '=', true)
          .executeTakeFirstOrThrow()
      ).n,
    );
    await withTransaction(db, async (trx) => {
      for (let i = 0; i < rows.length; i += CHUNK) {
        await trx
          .insertInto('hr_attendance_days')
          .values(
            rows.slice(i, i + CHUNK).map((r) => ({
              id: randomUUID(),
              employee_id: r.employeeId,
              work_date: r.workDate,
              status: r.status,
              check_in_minute: r.checkInMinute,
              check_out_minute: r.checkOutMinute,
              missing_punch: r.missingPunch,
              worked_minutes: r.workedMinutes,
              late_minutes: r.lateMinutes,
              early_leave_minutes: r.earlyLeaveMinutes,
              overtime_minutes: r.overtimeMinutes,
            })),
          )
          .onConflict((oc) =>
            oc
              .constraint('hr_attendance_days_unique')
              .doUpdateSet((eb) => ({
                status: eb.ref('excluded.status'),
                check_in_minute: eb.ref('excluded.check_in_minute'),
                check_out_minute: eb.ref('excluded.check_out_minute'),
                missing_punch: eb.ref('excluded.missing_punch'),
                worked_minutes: eb.ref('excluded.worked_minutes'),
                late_minutes: eb.ref('excluded.late_minutes'),
                early_leave_minutes: eb.ref('excluded.early_leave_minutes'),
                overtime_minutes: eb.ref('excluded.overtime_minutes'),
                updated_at: new Date(),
              }))
              .where('hr_attendance_days.is_manual', '=', false),
          )
          .execute();
      }
    });
    return { days: rows.length - keptManual, keptManual };
  }

  async list(db: Kysely<TenantDatabase>, query: AttendanceQueryDto): Promise<AttendanceDayDto[]> {
    assertRange(query.from, query.to);
    let q = this.daysQuery(db).where('d.work_date', '>=', query.from).where('d.work_date', '<=', query.to);
    if (query.employeeId) q = q.where('d.employee_id', '=', query.employeeId);
    if (query.departmentId) q = q.where('e.department_id', '=', query.departmentId);
    if (query.status) q = q.where('d.status', '=', query.status);
    if (query.exceptionsOnly === 'true') {
      q = q.where((eb) =>
        eb.or([eb('d.status', '=', 'absent'), eb('d.late_minutes', '>', 0), eb('d.early_leave_minutes', '>', 0), eb('d.missing_punch', '=', true)]),
      );
    }
    const rows = await q.orderBy('d.work_date', 'desc').orderBy('e.code').limit(20_000).execute();
    return rows.map(toDayDto);
  }

  /** A day corrected by hand: the minutes are recomputed from the times given, then the day is locked. */
  async updateDay(db: Kysely<TenantDatabase>, id: string, input: UpdateAttendanceDayDto): Promise<AttendanceDayDto> {
    const day = await db
      .selectFrom('hr_attendance_days as d')
      .innerJoin('employees as e', 'e.id', 'd.employee_id')
      .select(['d.id', 'd.work_date', 'e.shift_id'])
      .where('d.id', '=', id)
      .executeTakeFirst();
    if (!day) throw entityNotFound('HR_ATTENDANCE_DAY', id);
    const shift =
      (day.shift_id ? await db.selectFrom('hr_shifts').selectAll().where('id', '=', day.shift_id).executeTakeFirst() : undefined) ??
      (await db.selectFrom('hr_shifts').selectAll().where('is_default', '=', true).executeTakeFirstOrThrow());
    const rule = toRule(shift);
    const holiday = await db.selectFrom('hr_public_holidays').select('id').where('holiday_date', '=', day.work_date).executeTakeFirst();
    const kind = dayKind(day.work_date, rule, holiday ? new Set([day.work_date]) : new Set());
    const minOvertime = await this.settings.get(db, 'hr.minOvertimeMinutes');

    const checkIn = input.checkInMinute ?? null;
    let checkOut = input.checkOutMinute ?? null;
    if (checkIn !== null && checkOut !== null && checkOut <= checkIn) checkOut += 1440; // past midnight
    const zero = { workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
    const timed = input.status === 'present' || input.status === 'weekend' || input.status === 'holiday';
    const values =
      timed && checkIn !== null && checkOut !== null
        ? measure(input.status === 'present' ? kind : input.status === 'holiday' ? 'holiday' : 'weekend', rule, checkIn, checkOut, minOvertime)
        : { checkInMinute: timed ? checkIn : null, checkOutMinute: null, missingPunch: timed && checkIn !== null, ...zero };

    await db
      .updateTable('hr_attendance_days')
      .set({
        status: input.status,
        check_in_minute: values.checkInMinute,
        check_out_minute: values.checkOutMinute,
        missing_punch: values.missingPunch,
        worked_minutes: values.workedMinutes,
        late_minutes: values.lateMinutes,
        early_leave_minutes: values.earlyLeaveMinutes,
        overtime_minutes: values.overtimeMinutes,
        note: input.note?.trim() || null,
        is_manual: true,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .execute();
    return toDayDto(await this.daysQuery(db).where('d.id', '=', id).executeTakeFirstOrThrow());
  }

  /** Lets the next rebuild recompute a hand-corrected day from its punches again. */
  async resetDay(db: Kysely<TenantDatabase>, id: string): Promise<AttendanceDayDto> {
    const day = await db.selectFrom('hr_attendance_days').select(['employee_id', 'work_date']).where('id', '=', id).executeTakeFirst();
    if (!day) throw entityNotFound('HR_ATTENDANCE_DAY', id);
    await db.updateTable('hr_attendance_days').set({ is_manual: false, note: null }).where('id', '=', id).execute();
    await this.rebuild(db, { from: day.work_date, to: day.work_date, employeeIds: [day.employee_id] });
    return toDayDto(await this.daysQuery(db).where('d.id', '=', id).executeTakeFirstOrThrow());
  }

  async summary(db: Kysely<TenantDatabase>, query: AttendanceQueryDto): Promise<AttendanceSummaryRowDto[]> {
    assertRange(query.from, query.to);
    let q = db
      .selectFrom('hr_attendance_days as d')
      .innerJoin('employees as e', 'e.id', 'd.employee_id')
      .leftJoin('hr_departments as dep', 'dep.id', 'e.department_id')
      .where('d.work_date', '>=', query.from)
      .where('d.work_date', '<=', query.to)
      .select([
        'e.id',
        'e.code',
        'e.full_name',
        'dep.name as department_name',
        sql<string>`count(*) FILTER (WHERE d.status IN ('present', 'absent', 'leave'))`.as('work_days'),
        sql<string>`count(*) FILTER (WHERE d.status = 'present')`.as('present_days'),
        sql<string>`count(*) FILTER (WHERE d.status = 'absent')`.as('absent_days'),
        sql<string>`count(*) FILTER (WHERE d.status = 'leave')`.as('leave_days'),
        sql<string>`count(*) FILTER (WHERE d.missing_punch)`.as('missing_punch_days'),
        sql<string>`coalesce(sum(d.late_minutes), 0)`.as('late'),
        sql<string>`coalesce(sum(d.early_leave_minutes), 0)`.as('early'),
        sql<string>`coalesce(sum(d.overtime_minutes), 0)`.as('overtime'),
        sql<string>`coalesce(sum(d.worked_minutes), 0)`.as('worked'),
      ])
      .groupBy(['e.id', 'e.code', 'e.full_name', 'dep.name']);
    if (query.employeeId) q = q.where('d.employee_id', '=', query.employeeId);
    if (query.departmentId) q = q.where('e.department_id', '=', query.departmentId);
    const rows = await q.orderBy('e.code').execute();
    return rows.map((r) => ({
      employeeId: r.id,
      employeeCode: r.code,
      employeeName: r.full_name,
      departmentName: r.department_name,
      workDays: Number(r.work_days),
      presentDays: Number(r.present_days),
      absentDays: Number(r.absent_days),
      leaveDays: Number(r.leave_days),
      missingPunchDays: Number(r.missing_punch_days),
      lateMinutes: Number(r.late),
      earlyLeaveMinutes: Number(r.early),
      overtimeMinutes: Number(r.overtime),
      workedMinutes: Number(r.worked),
    }));
  }

  private daysQuery(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('hr_attendance_days as d')
      .innerJoin('employees as e', 'e.id', 'd.employee_id')
      .select([
        'd.id',
        'd.employee_id',
        'e.code',
        'e.full_name',
        'd.work_date',
        'd.status',
        'd.check_in_minute',
        'd.check_out_minute',
        'd.missing_punch',
        'd.worked_minutes',
        'd.late_minutes',
        'd.early_leave_minutes',
        'd.overtime_minutes',
        'd.is_manual',
        'd.note',
      ]);
  }
}

function toRule(s: { start_minute: number; end_minute: number; grace_minutes: number; break_minutes: number; weekly_off_days: number[] }): ShiftRule {
  return {
    startMinute: s.start_minute,
    endMinute: s.end_minute,
    graceMinutes: s.grace_minutes,
    breakMinutes: s.break_minutes,
    weeklyOffDays: s.weekly_off_days.map(Number),
  };
}

function toDayDto(r: {
  id: string;
  employee_id: string;
  code: string;
  full_name: string;
  work_date: string;
  status: string;
  check_in_minute: number | null;
  check_out_minute: number | null;
  missing_punch: boolean;
  worked_minutes: number;
  late_minutes: number;
  early_leave_minutes: number;
  overtime_minutes: number;
  is_manual: boolean;
  note: string | null;
}): AttendanceDayDto {
  return {
    id: r.id,
    employeeId: r.employee_id,
    employeeCode: r.code,
    employeeName: r.full_name,
    workDate: r.work_date,
    status: r.status as AttendanceStatusDto,
    checkInMinute: r.check_in_minute,
    checkOutMinute: r.check_out_minute,
    missingPunch: r.missing_punch,
    workedMinutes: r.worked_minutes,
    lateMinutes: r.late_minutes,
    earlyLeaveMinutes: r.early_leave_minutes,
    overtimeMinutes: r.overtime_minutes,
    isManual: r.is_manual,
    note: r.note,
  };
}

/** Device IDs come as "0007", "7" or "7.0": compare numbers without padding, text case-insensitively. */
export function normaliseKey(key: string): string {
  const t = key.trim();
  if (/^\d+(\.0+)?$/.test(t)) return String(Number(t));
  return t.toLowerCase();
}

function assertRange(from: string, to: string): void {
  if (from > to || daysBetween(from, to) >= MAX_RANGE_DAYS) {
    throw new BusinessRuleError('Pick a period of at most a year.', { code: 'HR_ATTENDANCE.RANGE' });
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
