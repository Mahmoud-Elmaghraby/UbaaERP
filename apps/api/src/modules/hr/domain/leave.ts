import { BusinessRuleError } from '../../../shared/errors/domain-errors';
import { datesBetween, dayKind, type ShiftRule } from './attendance';

/**
 * The working days a leave takes: the employee's weekly days off and public holidays inside the
 * period don't count. A half day is 0.5 of a single working day.
 */
export function countLeaveDays(
  startDate: string,
  endDate: string,
  halfDay: boolean,
  shift: ShiftRule,
  holidays: ReadonlySet<string>,
): number {
  const working = datesBetween(startDate, endDate).filter((d) => dayKind(d, shift, holidays) === 'work').length;
  return halfDay ? Math.min(working, 1) * 0.5 : working;
}

export interface BalanceParts {
  entitled: number;
  carriedOver: number;
  adjustment: number;
  used: number;
  pending: number;
}

/** What is left to request: entitlement + carried + adjustment − approved − pending. */
export function available(b: BalanceParts): number {
  return round1(b.entitled + b.carriedOver + b.adjustment - b.used - b.pending);
}

/** Days rolling into next year: what's left, capped by the type's carry-over limit. */
export function carryOver(b: BalanceParts, maxCarryOver: number): number {
  return Math.max(0, Math.min(maxCarryOver, round1(b.entitled + b.carriedOver + b.adjustment - b.used)));
}

/** A request must fit the balance it draws on (its own type, and its parent's). */
export function assertFits(days: number, left: number, typeName: string): void {
  if (days > left + 1e-9) {
    throw new BusinessRuleError(`Not enough "${typeName}" balance: ${left} day(s) left.`, {
      code: 'HR_LEAVE.INSUFFICIENT_BALANCE',
      params: { type: typeName, available: left, days },
    });
  }
}

export function round1(n: number): number {
  return Math.round(n * 2) / 2;
}
