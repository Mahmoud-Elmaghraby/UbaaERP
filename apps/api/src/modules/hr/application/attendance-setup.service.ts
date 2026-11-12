import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { HrHolidayDto, HrShiftDto, SaveHrHolidaysDto, SaveHrShiftDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { withTransaction } from '../../../database/tenant/transaction.util';
import { BusinessRuleError, isPostgresForeignKeyViolation, isPostgresUniqueViolation } from '../../../shared/errors/domain-errors';
import { duplicateEntity, entityNotFound } from '../../../shared/errors/entity-errors';
import { scheduledMinutes } from '../domain/attendance';

/** Shifts and public holidays. Plain CRUD; exactly one active default shift at all times. */
@Injectable()
export class AttendanceSetupService {
  async listShifts(db: Kysely<TenantDatabase>): Promise<HrShiftDto[]> {
    const rows = await this.shiftsQuery(db).orderBy('s.is_default', 'desc').orderBy('s.name').execute();
    return rows.map(toShiftDto);
  }

  async getShift(db: Kysely<TenantDatabase>, id: string): Promise<HrShiftDto> {
    const row = await this.shiftsQuery(db).where('s.id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('HR_SHIFT', id);
    return toShiftDto(row);
  }

  async saveShift(db: Kysely<TenantDatabase>, id: string | null, input: SaveHrShiftDto): Promise<HrShiftDto> {
    const shiftId = id ?? randomUUID();
    const existing = id ? await this.getShift(db, id) : null;
    const isDefault = input.isDefault ?? existing?.isDefault ?? false;
    const isActive = input.isActive ?? true;
    if (existing?.isDefault && !isDefault) {
      throw new BusinessRuleError('Choose another default shift instead.', { code: 'HR_SHIFT.DEFAULT_REQUIRED' });
    }
    if (isDefault && !isActive) {
      throw new BusinessRuleError('The default shift cannot be inactive.', { code: 'HR_SHIFT.DEFAULT_REQUIRED' });
    }
    if (input.startMinute === input.endMinute) {
      throw new BusinessRuleError('A shift needs different start and end times.', { code: 'HR_SHIFT.ZERO_LENGTH' });
    }
    const values = {
      name: input.name,
      start_minute: input.startMinute,
      end_minute: input.endMinute,
      grace_minutes: input.graceMinutes,
      break_minutes: input.breakMinutes,
      weekly_off_days: [...new Set(input.weeklyOffDays)].sort(),
      is_default: isDefault,
      is_active: isActive,
    };
    await withTransaction(db, async (trx) => {
      if (isDefault) await trx.updateTable('hr_shifts').set({ is_default: false }).where('is_default', '=', true).where('id', '<>', shiftId).execute();
      try {
        if (id) await trx.updateTable('hr_shifts').set({ ...values, updated_at: new Date() }).where('id', '=', id).execute();
        else await trx.insertInto('hr_shifts').values({ id: shiftId, ...values }).execute();
      } catch (err) {
        if (isPostgresUniqueViolation(err)) throw duplicateEntity('HR_SHIFT', 'name', input.name);
        throw err;
      }
    });
    return this.getShift(db, shiftId);
  }

  async deleteShift(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const shift = await this.getShift(db, id);
    if (shift.isDefault) throw new BusinessRuleError('The default shift cannot be deleted.', { code: 'HR_SHIFT.DEFAULT_REQUIRED' });
    try {
      await db.deleteFrom('hr_shifts').where('id', '=', id).execute();
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new BusinessRuleError(`Shift "${shift.name}" has employees.`, { code: 'HR_SHIFT.IN_USE', params: { name: shift.name } });
      }
      throw err;
    }
  }

  async listHolidays(db: Kysely<TenantDatabase>, year?: number): Promise<HrHolidayDto[]> {
    let q = db.selectFrom('hr_public_holidays').select(['id', 'holiday_date', 'name']);
    if (year) q = q.where('holiday_date', '>=', `${year}-01-01`).where('holiday_date', '<=', `${year}-12-31`);
    const rows = await q.orderBy('holiday_date').execute();
    return rows.map((r) => ({ id: r.id, date: r.holiday_date, name: r.name }));
  }

  /** Adds the days (a day already on the calendar just gets the new name). */
  async addHolidays(db: Kysely<TenantDatabase>, input: SaveHrHolidaysDto): Promise<HrHolidayDto[]> {
    const dates = [...new Set(input.dates)].sort();
    await db
      .insertInto('hr_public_holidays')
      .values(dates.map((d) => ({ id: randomUUID(), holiday_date: d, name: input.name })))
      .onConflict((oc) => oc.column('holiday_date').doUpdateSet({ name: input.name }))
      .execute();
    const year = Number(dates[0]!.slice(0, 4));
    return this.listHolidays(db, year);
  }

  async deleteHoliday(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const result = await db.deleteFrom('hr_public_holidays').where('id', '=', id).executeTakeFirst();
    if (!result.numDeletedRows) throw entityNotFound('HR_HOLIDAY', id);
  }

  private shiftsQuery(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('hr_shifts as s')
      .selectAll('s')
      .select(
        sql<string>`(
          SELECT count(*) FROM employees e
          WHERE e.status <> 'terminated' AND (e.shift_id = s.id OR (e.shift_id IS NULL AND s.is_default))
        )`.as('employee_count'),
      );
  }
}

function toShiftDto(row: {
  id: string;
  name: string;
  start_minute: number;
  end_minute: number;
  grace_minutes: number;
  break_minutes: number;
  weekly_off_days: number[];
  is_default: boolean;
  is_active: boolean;
  employee_count: string;
}): HrShiftDto {
  const rule = {
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    graceMinutes: row.grace_minutes,
    breakMinutes: row.break_minutes,
    weeklyOffDays: row.weekly_off_days,
  };
  return {
    id: row.id,
    name: row.name,
    ...rule,
    isDefault: row.is_default,
    isActive: row.is_active,
    scheduledMinutes: scheduledMinutes(rule),
    employeeCount: Number(row.employee_count),
  };
}
