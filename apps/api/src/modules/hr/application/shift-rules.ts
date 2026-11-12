import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { BusinessRuleError } from '../../../shared/errors/domain-errors';
import type { ShiftRule } from '../domain/attendance';

type ShiftRow = { start_minute: number; end_minute: number; grace_minutes: number; break_minutes: number; weekly_off_days: number[] };

export function toShiftRule(s: ShiftRow): ShiftRule {
  return {
    startMinute: s.start_minute,
    endMinute: s.end_minute,
    graceMinutes: s.grace_minutes,
    breakMinutes: s.break_minutes,
    weeklyOffDays: s.weekly_off_days.map(Number),
  };
}

/** Every shift by id, plus the default one for employees without a shift of their own. */
export async function loadShiftRules(db: Kysely<TenantDatabase>): Promise<{ of: (shiftId: string | null) => ShiftRule }> {
  const shifts = await db.selectFrom('hr_shifts').selectAll().execute();
  const fallback = shifts.find((s) => s.is_default) ?? shifts[0];
  if (!fallback) throw new BusinessRuleError('Define a shift first.', { code: 'HR_SHIFT.DEFAULT_REQUIRED' });
  const byId = new Map(shifts.map((s) => [s.id, toShiftRule(s)]));
  const defaultRule = toShiftRule(fallback);
  return { of: (shiftId) => (shiftId ? (byId.get(shiftId) ?? defaultRule) : defaultRule) };
}

/** Public holidays between two dates (inclusive). */
export async function loadHolidays(db: Kysely<TenantDatabase>, from: string, to: string): Promise<Set<string>> {
  const rows = await db.selectFrom('hr_public_holidays').select('holiday_date').where('holiday_date', '>=', from).where('holiday_date', '<=', to).execute();
  return new Set(rows.map((r) => r.holiday_date));
}
