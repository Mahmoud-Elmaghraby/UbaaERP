import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type {
  CarryOverLeaveDto,
  CreateLeaveRequestDto,
  DecideLeaveRequestDto,
  LeaveBalanceDto,
  LeaveBalanceQueryDto,
  LeavePreviewDto,
  LeaveRequestDto,
  LeaveRequestQueryDto,
  LeaveRequestStatusDto,
  LeaveTypeDto,
  SaveLeaveBalanceDto,
  SaveLeaveTypeDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { withTransaction } from '../../../database/tenant/transaction.util';
import { BusinessRuleError, isPostgresForeignKeyViolation, isPostgresUniqueViolation } from '../../../shared/errors/domain-errors';
import { duplicateEntity, entityNotFound } from '../../../shared/errors/entity-errors';
import { NumberingSequencesService } from '../../settings/application/services/numbering-sequences.service';
import { assertFits, available, carryOver, countLeaveDays, round1, type BalanceParts } from '../domain/leave';
import { AttendanceService } from './attendance.service';
import { loadHolidays, loadShiftRules } from './shift-rules';

type TypeRow = {
  id: string;
  name: string;
  pay_percent: number;
  has_balance: boolean;
  annual_days: string | null;
  max_carry_over: string;
  parent_type_id: string | null;
  is_active: boolean;
};

/**
 * Leave (الإجازات): types, yearly balances and requests. A request is recorded by HR, decided by
 * someone with hr.leaves.approve (never on their own leave), and an approved leave marks the
 * working days of the attendance sheet. Used days are always computed from the requests.
 */
@Injectable()
export class LeavesService {
  constructor(
    private readonly numbering: NumberingSequencesService,
    private readonly attendance: AttendanceService,
  ) {}

  // ── types ───────────────────────────────────────────────────────────────
  async listTypes(db: Kysely<TenantDatabase>): Promise<LeaveTypeDto[]> {
    const rows = await db.selectFrom('hr_leave_types').selectAll().orderBy('is_active', 'desc').orderBy('created_at').execute();
    const names = new Map(rows.map((r) => [r.id, r.name]));
    return rows.map((r) => toTypeDto(r, names));
  }

  async saveType(db: Kysely<TenantDatabase>, id: string | null, input: SaveLeaveTypeDto): Promise<LeaveTypeDto> {
    const typeId = id ?? randomUUID();
    const parentId = input.parentTypeId ?? null;
    if (parentId) {
      const parent = await db.selectFrom('hr_leave_types').selectAll().where('id', '=', parentId).executeTakeFirst();
      if (!parent) throw entityNotFound('HR_LEAVE_TYPE', parentId);
      const children = id ? await db.selectFrom('hr_leave_types').select('id').where('parent_type_id', '=', id).execute() : [];
      // One level only, both sides with a balance.
      if (parent.id === typeId || parent.parent_type_id || !parent.has_balance || !input.hasBalance || children.length > 0) {
        throw new BusinessRuleError('A leave type can draw on one main type with a balance.', { code: 'HR_LEAVE_TYPE.BAD_PARENT' });
      }
    }
    const values = {
      name: input.name,
      pay_percent: input.payPercent,
      has_balance: input.hasBalance,
      annual_days: input.hasBalance && input.annualDays != null ? String(input.annualDays) : null,
      max_carry_over: String(input.hasBalance ? input.maxCarryOver : 0),
      parent_type_id: parentId,
      is_active: input.isActive ?? true,
    };
    try {
      if (id) {
        const updated = await db.updateTable('hr_leave_types').set({ ...values, updated_at: new Date() }).where('id', '=', id).executeTakeFirst();
        if (!updated.numUpdatedRows) throw entityNotFound('HR_LEAVE_TYPE', id);
      } else {
        await db.insertInto('hr_leave_types').values({ id: typeId, ...values }).execute();
      }
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('HR_LEAVE_TYPE', 'name', input.name);
      throw err;
    }
    return (await this.listTypes(db)).find((t) => t.id === typeId)!;
  }

  async deleteType(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    try {
      const deleted = await db.deleteFrom('hr_leave_types').where('id', '=', id).executeTakeFirst();
      if (!deleted.numDeletedRows) throw entityNotFound('HR_LEAVE_TYPE', id);
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new BusinessRuleError('This leave type has requests — deactivate it instead.', { code: 'HR_LEAVE_TYPE.IN_USE' });
      }
      throw err;
    }
  }

  // ── requests ────────────────────────────────────────────────────────────
  async listRequests(db: Kysely<TenantDatabase>, query: LeaveRequestQueryDto = {}): Promise<LeaveRequestDto[]> {
    let q = this.requestsQuery(db);
    if (query.status) q = q.where('r.status', '=', query.status);
    if (query.employeeId) q = q.where('r.employee_id', '=', query.employeeId);
    if (query.from) q = q.where('r.end_date', '>=', query.from);
    if (query.to) q = q.where('r.start_date', '<=', query.to);
    const rows = await q.orderBy('r.start_date', 'desc').orderBy('r.number', 'desc').limit(5000).execute();
    return rows.map(toRequestDto);
  }

  async getRequest(db: Kysely<TenantDatabase>, id: string): Promise<LeaveRequestDto> {
    const row = await this.requestsQuery(db).where('r.id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('HR_LEAVE_REQUEST', id);
    return toRequestDto(row);
  }

  /** What a request would take and what's left, without saving anything. */
  async preview(db: Kysely<TenantDatabase>, input: CreateLeaveRequestDto): Promise<LeavePreviewDto> {
    const { days, type } = await this.validate(db, input, null);
    if (!type.has_balance) return { days, available: null, pending: 0 };
    const parts = await this.balanceParts(db, input.employeeId, type, Number(input.startDate.slice(0, 4)), null);
    return { days, available: available(parts), pending: parts.pending };
  }

  async createRequest(db: Kysely<TenantDatabase>, input: CreateLeaveRequestDto, userId: string | null): Promise<LeaveRequestDto> {
    const { days } = await this.validate(db, input, null);
    const id = randomUUID();
    const { formatted } = await this.numbering.allocateNext(db, 'leave_request');
    await db
      .insertInto('hr_leave_requests')
      .values({
        id,
        number: formatted,
        employee_id: input.employeeId,
        leave_type_id: input.leaveTypeId,
        start_date: input.startDate,
        end_date: input.endDate,
        half_day: input.halfDay,
        days: String(days),
        reason: input.reason?.trim() || null,
        created_by: userId,
      })
      .execute();
    return this.getRequest(db, id);
  }

  async approve(db: Kysely<TenantDatabase>, id: string, input: DecideLeaveRequestDto, userId: string): Promise<LeaveRequestDto> {
    const request = await this.requirePending(db, id);
    await this.assertNotOwnLeave(db, request.employee_id, userId);
    // The balance may have moved since the request was made.
    await this.validate(
      db,
      { employeeId: request.employee_id, leaveTypeId: request.leave_type_id, startDate: request.start_date, endDate: request.end_date, halfDay: request.half_day },
      id,
    );
    await this.decide(db, id, 'approved', input, userId);
    await this.refreshAttendance(db, request);
    return this.getRequest(db, id);
  }

  async reject(db: Kysely<TenantDatabase>, id: string, input: DecideLeaveRequestDto, userId: string): Promise<LeaveRequestDto> {
    const request = await this.requirePending(db, id);
    await this.assertNotOwnLeave(db, request.employee_id, userId);
    await this.decide(db, id, 'rejected', input, userId);
    return this.getRequest(db, id);
  }

  /** A pending request is withdrawn; an approved one is called off (its days return to the balance). */
  async cancel(db: Kysely<TenantDatabase>, id: string, input: DecideLeaveRequestDto, userId: string): Promise<LeaveRequestDto> {
    const request = await db.selectFrom('hr_leave_requests').selectAll().where('id', '=', id).executeTakeFirst();
    if (!request) throw entityNotFound('HR_LEAVE_REQUEST', id);
    if (request.status !== 'pending' && request.status !== 'approved') {
      throw new BusinessRuleError('Only a pending or approved request can be cancelled.', { code: 'HR_LEAVE.NOT_OPEN' });
    }
    await this.decide(db, id, 'cancelled', input, userId);
    if (request.status === 'approved') await this.refreshAttendance(db, request);
    return this.getRequest(db, id);
  }

  // ── balances ────────────────────────────────────────────────────────────
  async balances(db: Kysely<TenantDatabase>, query: LeaveBalanceQueryDto): Promise<LeaveBalanceDto[]> {
    const { year } = query;
    let typesQ = db.selectFrom('hr_leave_types').selectAll().where('has_balance', '=', true).where('is_active', '=', true);
    if (query.leaveTypeId) typesQ = typesQ.where('id', '=', query.leaveTypeId);
    const types = await typesQ.orderBy('created_at').execute();
    let employeesQ = db
      .selectFrom('employees')
      .select(['id', 'code', 'full_name'])
      .where('hire_date', '<=', `${year}-12-31`)
      .where((eb) => eb.or([eb('termination_date', 'is', null), eb('termination_date', '>=', `${year}-01-01`)]));
    if (query.employeeId) employeesQ = employeesQ.where('id', '=', query.employeeId);
    const employees = await employeesQ.orderBy('code').execute();
    if (employees.length === 0 || types.length === 0) return [];

    const ids = employees.map((e) => e.id);
    const stored = await db.selectFrom('hr_leave_balances').selectAll().where('year', '=', year).where('employee_id', 'in', ids).execute();
    const storedMap = new Map(stored.map((b) => [`${b.employee_id}|${b.leave_type_id}`, b]));
    const usage = await this.usage(db, ids, year, null);
    const allTypes = await db.selectFrom('hr_leave_types').select(['id', 'parent_type_id']).execute();

    const out: LeaveBalanceDto[] = [];
    for (const e of employees) {
      for (const type of types) {
        const parts = partsFrom(type, storedMap.get(`${e.id}|${type.id}`), usage, e.id, allTypes);
        const row = storedMap.get(`${e.id}|${type.id}`);
        out.push({
          employeeId: e.id,
          employeeCode: e.code,
          employeeName: e.full_name,
          leaveTypeId: type.id,
          leaveTypeName: type.name,
          year,
          ...parts,
          available: available(parts),
          isCustom: Boolean(row),
          note: row?.note ?? null,
        });
      }
    }
    return out;
  }

  async saveBalance(db: Kysely<TenantDatabase>, input: SaveLeaveBalanceDto): Promise<LeaveBalanceDto> {
    const type = await this.requireType(db, input.leaveTypeId);
    if (!type.has_balance) throw new BusinessRuleError('This leave type has no balance.', { code: 'HR_LEAVE_TYPE.NO_BALANCE' });
    const values = {
      entitled: String(input.entitled),
      carried_over: String(input.carriedOver),
      adjustment: String(input.adjustment),
      note: input.note?.trim() || null,
    };
    try {
      await db
        .insertInto('hr_leave_balances')
        .values({ id: randomUUID(), employee_id: input.employeeId, leave_type_id: input.leaveTypeId, year: input.year, ...values })
        .onConflict((oc) => oc.constraint('hr_leave_balances_unique').doUpdateSet({ ...values, updated_at: new Date() }))
        .execute();
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) throw entityNotFound('EMPLOYEE', input.employeeId);
      throw err;
    }
    return (await this.balances(db, { year: input.year, employeeId: input.employeeId, leaveTypeId: input.leaveTypeId }))[0]!;
  }

  /** Closes a year: unused days (up to each type's cap) become next year's carried-over days. */
  async carryOverYear(db: Kysely<TenantDatabase>, input: CarryOverLeaveDto): Promise<{ updated: number }> {
    const types = await db.selectFrom('hr_leave_types').selectAll().where('has_balance', '=', true).where('max_carry_over', '>', '0').execute();
    if (types.length === 0) return { updated: 0 };
    const rows = await this.balances(db, { year: input.fromYear });
    const next = input.fromYear + 1;
    const nextStored = await db.selectFrom('hr_leave_balances').selectAll().where('year', '=', next).execute();
    const nextMap = new Map(nextStored.map((b) => [`${b.employee_id}|${b.leave_type_id}`, b]));
    let updated = 0;
    await withTransaction(db, async (trx) => {
      for (const type of types) {
        for (const r of rows.filter((x) => x.leaveTypeId === type.id)) {
          const days = carryOver(r, Number(type.max_carry_over));
          const existing = nextMap.get(`${r.employeeId}|${type.id}`);
          if (!existing && days === 0) continue;
          await trx
            .insertInto('hr_leave_balances')
            .values({
              id: randomUUID(),
              employee_id: r.employeeId,
              leave_type_id: type.id,
              year: next,
              entitled: existing?.entitled ?? type.annual_days ?? '0',
              carried_over: String(days),
            })
            .onConflict((oc) => oc.constraint('hr_leave_balances_unique').doUpdateSet({ carried_over: String(days), updated_at: new Date() }))
            .execute();
          updated += 1;
        }
      }
    });
    return { updated };
  }

  // ── internals ───────────────────────────────────────────────────────────

  /** Checks a request (new, or being approved = `selfId`) and returns its working days. */
  private async validate(db: Kysely<TenantDatabase>, input: Omit<CreateLeaveRequestDto, 'reason'>, selfId: string | null) {
    if (input.startDate.slice(0, 4) !== input.endDate.slice(0, 4)) {
      throw new BusinessRuleError('A leave cannot cross into another year — split it in two.', { code: 'HR_LEAVE.CROSS_YEAR' });
    }
    const employee = await db
      .selectFrom('employees')
      .select(['id', 'status', 'hire_date', 'shift_id', 'full_name'])
      .where('id', '=', input.employeeId)
      .executeTakeFirst();
    if (!employee) throw entityNotFound('EMPLOYEE', input.employeeId);
    if (employee.status === 'terminated') {
      throw new BusinessRuleError('The employee has left.', { code: 'EMPLOYEE.TERMINATED_READ_ONLY' });
    }
    if (input.startDate < employee.hire_date) {
      throw new BusinessRuleError('The leave starts before the hire date.', { code: 'HR_LEAVE.BEFORE_HIRE' });
    }
    const type = await this.requireType(db, input.leaveTypeId);
    if (!type.is_active && !selfId) {
      throw new BusinessRuleError(`Leave type "${type.name}" is inactive.`, { code: 'HR_LEAVE_TYPE.INACTIVE', params: { name: type.name } });
    }

    const rule = (await loadShiftRules(db)).of(employee.shift_id);
    const days = countLeaveDays(input.startDate, input.endDate, input.halfDay ?? false, rule, await loadHolidays(db, input.startDate, input.endDate));
    if (days === 0) throw new BusinessRuleError('The period has no working days.', { code: 'HR_LEAVE.NO_WORKING_DAYS' });

    let overlapQ = db
      .selectFrom('hr_leave_requests')
      .select(['number'])
      .where('employee_id', '=', input.employeeId)
      .where('status', 'in', ['pending', 'approved'])
      .where('start_date', '<=', input.endDate)
      .where('end_date', '>=', input.startDate);
    if (selfId) overlapQ = overlapQ.where('id', '<>', selfId);
    const overlap = await overlapQ.executeTakeFirst();
    if (overlap) {
      throw new BusinessRuleError(`Overlaps leave request ${overlap.number}.`, { code: 'HR_LEAVE.OVERLAP', params: { number: overlap.number } });
    }

    if (type.has_balance) {
      const year = Number(input.startDate.slice(0, 4));
      assertFits(days, available(await this.balanceParts(db, input.employeeId, type, year, selfId)), type.name);
      if (type.parent_type_id) {
        const parent = await this.requireType(db, type.parent_type_id);
        assertFits(days, available(await this.balanceParts(db, input.employeeId, parent, year, selfId)), parent.name);
      }
    }
    return { days, type };
  }

  private async balanceParts(db: Kysely<TenantDatabase>, employeeId: string, type: TypeRow, year: number, excludeId: string | null): Promise<BalanceParts> {
    const stored = await db
      .selectFrom('hr_leave_balances')
      .selectAll()
      .where('employee_id', '=', employeeId)
      .where('leave_type_id', '=', type.id)
      .where('year', '=', year)
      .executeTakeFirst();
    const allTypes = await db.selectFrom('hr_leave_types').select(['id', 'parent_type_id']).execute();
    return partsFrom(type, stored, await this.usage(db, [employeeId], year, excludeId), employeeId, allTypes);
  }

  /** Approved and pending days per employee and type in a year. */
  private async usage(db: Kysely<TenantDatabase>, employeeIds: string[], year: number, excludeId: string | null) {
    let q = db
      .selectFrom('hr_leave_requests')
      .select(['employee_id', 'leave_type_id', 'status', (eb) => eb.fn.sum<string>('days').as('days')])
      .where('employee_id', 'in', employeeIds)
      .where('status', 'in', ['pending', 'approved'])
      .where('start_date', '>=', `${year}-01-01`)
      .where('start_date', '<=', `${year}-12-31`)
      .groupBy(['employee_id', 'leave_type_id', 'status']);
    if (excludeId) q = q.where('id', '<>', excludeId);
    const map = new Map<string, { used: number; pending: number }>();
    for (const r of await q.execute()) {
      const key = `${r.employee_id}|${r.leave_type_id}`;
      const entry = map.get(key) ?? { used: 0, pending: 0 };
      if (r.status === 'approved') entry.used += Number(r.days);
      else entry.pending += Number(r.days);
      map.set(key, entry);
    }
    return map;
  }

  private async requireType(db: Kysely<TenantDatabase>, id: string): Promise<TypeRow> {
    const type = await db.selectFrom('hr_leave_types').selectAll().where('id', '=', id).executeTakeFirst();
    if (!type) throw entityNotFound('HR_LEAVE_TYPE', id);
    return type;
  }

  private async requirePending(db: Kysely<TenantDatabase>, id: string) {
    const request = await db.selectFrom('hr_leave_requests').selectAll().where('id', '=', id).executeTakeFirst();
    if (!request) throw entityNotFound('HR_LEAVE_REQUEST', id);
    if (request.status !== 'pending') {
      throw new BusinessRuleError('This request was already decided.', { code: 'HR_LEAVE.NOT_PENDING' });
    }
    return request;
  }

  /** Nobody decides their own leave. */
  private async assertNotOwnLeave(db: Kysely<TenantDatabase>, employeeId: string, userId: string): Promise<void> {
    const own = await db.selectFrom('employees').select('id').where('id', '=', employeeId).where('user_id', '=', userId).executeTakeFirst();
    if (own) throw new BusinessRuleError('You cannot decide your own leave.', { code: 'HR_LEAVE.SELF_APPROVAL' });
  }

  private async decide(db: Kysely<TenantDatabase>, id: string, status: LeaveRequestStatusDto, input: DecideLeaveRequestDto, userId: string | null) {
    await db
      .updateTable('hr_leave_requests')
      .set({ status, decided_by: userId, decided_at: new Date(), decision_note: input.note?.trim() || null })
      .where('id', '=', id)
      .execute();
  }

  /** Re-marks the leave's days on the attendance sheet (days still to come are marked when they're built). */
  private async refreshAttendance(db: Kysely<TenantDatabase>, request: { employee_id: string; start_date: string; end_date: string }) {
    await this.attendance.rebuild(db, { from: request.start_date, to: request.end_date, employeeIds: [request.employee_id] });
  }

  private requestsQuery(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('hr_leave_requests as r')
      .innerJoin('employees as e', 'e.id', 'r.employee_id')
      .innerJoin('hr_leave_types as t', 't.id', 'r.leave_type_id')
      .leftJoin('employees as m', 'm.id', 'e.manager_id')
      .leftJoin('users as u', 'u.id', 'r.decided_by')
      .select([
        'r.id',
        'r.number',
        'r.employee_id',
        'e.code as employee_code',
        'e.full_name as employee_name',
        'm.full_name as manager_name',
        'r.leave_type_id',
        't.name as type_name',
        'r.start_date',
        'r.end_date',
        'r.half_day',
        'r.days',
        'r.reason',
        'r.status',
        'u.full_name as decided_by_name',
        'r.decided_at',
        'r.decision_note',
        'r.created_at',
      ]);
  }
}

/**
 * A balance: the stored row (or the type's default entitlement) and the usage — for a main type,
 * the days of its child types too (casual leave also comes out of the annual balance).
 */
function partsFrom(
  type: TypeRow,
  stored: { entitled: string; carried_over: string; adjustment: string } | undefined,
  usage: Map<string, { used: number; pending: number }>,
  employeeId: string,
  allTypes: { id: string; parent_type_id: string | null }[],
): BalanceParts {
  const typeIds = [type.id, ...allTypes.filter((t) => t.parent_type_id === type.id).map((t) => t.id)];
  let used = 0;
  let pending = 0;
  for (const id of typeIds) {
    const u = usage.get(`${employeeId}|${id}`);
    used += u?.used ?? 0;
    pending += u?.pending ?? 0;
  }
  return {
    entitled: Number(stored?.entitled ?? type.annual_days ?? 0),
    carriedOver: Number(stored?.carried_over ?? 0),
    adjustment: Number(stored?.adjustment ?? 0),
    used: round1(used),
    pending: round1(pending),
  };
}

function toTypeDto(r: TypeRow, names: Map<string, string>): LeaveTypeDto {
  return {
    id: r.id,
    name: r.name,
    payPercent: r.pay_percent,
    hasBalance: r.has_balance,
    annualDays: r.annual_days === null ? null : Number(r.annual_days),
    maxCarryOver: Number(r.max_carry_over),
    parentTypeId: r.parent_type_id,
    parentTypeName: r.parent_type_id ? (names.get(r.parent_type_id) ?? null) : null,
    isActive: r.is_active,
  };
}

function toRequestDto(r: {
  id: string;
  number: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  manager_name: string | null;
  leave_type_id: string;
  type_name: string;
  start_date: string;
  end_date: string;
  half_day: boolean;
  days: string;
  reason: string | null;
  status: string;
  decided_by_name: string | null;
  decided_at: Date | null;
  decision_note: string | null;
  created_at: Date;
}): LeaveRequestDto {
  return {
    id: r.id,
    number: r.number,
    employeeId: r.employee_id,
    employeeCode: r.employee_code,
    employeeName: r.employee_name,
    managerName: r.manager_name,
    leaveTypeId: r.leave_type_id,
    leaveTypeName: r.type_name,
    startDate: r.start_date,
    endDate: r.end_date,
    halfDay: r.half_day,
    days: Number(r.days),
    reason: r.reason,
    status: r.status as LeaveRequestStatusDto,
    decidedByName: r.decided_by_name,
    decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
    decisionNote: r.decision_note,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
