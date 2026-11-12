/**
 * Attendance rules (pure). Every time is a whole number of minutes: a shift's start/end after
 * midnight, and a punch relative to the work day's midnight (−240 … 1439 + next-day minutes).
 */

export interface ShiftRule {
  startMinute: number;
  endMinute: number;
  graceMinutes: number;
  breakMinutes: number;
  /** 0 = Sunday … 6 = Saturday. */
  weeklyOffDays: readonly number[];
}

export type DayKind = 'work' | 'weekend' | 'holiday';
export type AttendanceStatus = 'present' | 'absent' | 'weekend' | 'holiday' | 'leave';

export interface DayResult {
  status: AttendanceStatus;
  checkInMinute: number | null;
  checkOutMinute: number | null;
  missingPunch: boolean;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
}

const DAY = 1440;

/** The shift's length on the clock: an end at or before the start runs past midnight. */
export function shiftLength(shift: Pick<ShiftRule, 'startMinute' | 'endMinute'>): number {
  const length = (shift.endMinute - shift.startMinute + DAY) % DAY;
  return length === 0 ? DAY : length;
}

/** Minutes the employee is expected to work (length − unpaid break). */
export function scheduledMinutes(shift: ShiftRule): number {
  return Math.max(0, shiftLength(shift) - shift.breakMinutes);
}

/** Where the shift ends, relative to the work day's midnight (past 1440 for a night shift). */
export function shiftEnd(shift: ShiftRule): number {
  return shift.startMinute + shiftLength(shift);
}

/**
 * A work day's punch window: from 4 hours before the shift starts, for 24 hours. Consecutive days'
 * windows touch but never overlap, so each punch belongs to exactly one work day.
 */
export function punchWindow(shift: Pick<ShiftRule, 'startMinute'>): { from: number; to: number } {
  return { from: shift.startMinute - 240, to: shift.startMinute - 240 + DAY };
}

/** The weekday (0 = Sunday) of an ISO date, timezone-free. */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function dayKind(isoDate: string, shift: ShiftRule, holidays: ReadonlySet<string>): DayKind {
  if (holidays.has(isoDate)) return 'holiday';
  return shift.weeklyOffDays.includes(weekdayOf(isoDate)) ? 'weekend' : 'work';
}

/**
 * One day from its first and last punch (minutes relative to the day's midnight).
 *  - Work day without punches → absent. One punch only → present, flagged, nothing worked.
 *  - Late counts from the shift start once past the grace period; early leave before the shift end.
 *  - Overtime: time worked beyond the scheduled minutes, ignored under `minOvertimeMinutes`.
 *    On a weekend or holiday every worked minute is overtime and lateness doesn't apply.
 */
export function evaluateDay(
  kind: DayKind,
  shift: ShiftRule,
  punches: readonly number[],
  minOvertimeMinutes: number,
): DayResult {
  const sorted = [...punches].sort((a, b) => a - b);
  const first = sorted[0] ?? null;
  const last = sorted.length > 1 ? sorted[sorted.length - 1]! : null;
  const baseStatus: AttendanceStatus = kind === 'work' ? 'present' : kind;
  const empty = { workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };

  if (first === null) {
    return { status: kind === 'work' ? 'absent' : kind, checkInMinute: null, checkOutMinute: null, missingPunch: false, ...empty };
  }
  if (last === null) {
    return { status: baseStatus, checkInMinute: first, checkOutMinute: null, missingPunch: true, ...empty };
  }
  return { status: baseStatus, ...measure(kind, shift, first, last, minOvertimeMinutes) };
}

/** Minutes from a known check-in and check-out (also used for a day corrected by hand). */
export function measure(
  kind: DayKind,
  shift: ShiftRule,
  checkIn: number,
  checkOut: number,
  minOvertimeMinutes: number,
): Omit<DayResult, 'status'> {
  const span = Math.max(0, checkOut - checkIn);
  // The unpaid break is only taken out of a day long enough to have had one.
  const worked = span > shift.breakMinutes * 2 ? span - shift.breakMinutes : span;
  const late = kind === 'work' && checkIn > shift.startMinute + shift.graceMinutes ? checkIn - shift.startMinute : 0;
  const early = kind === 'work' ? Math.max(0, shiftEnd(shift) - checkOut) : 0;
  const extra = kind === 'work' ? worked - scheduledMinutes(shift) : worked;
  const overtime = extra >= Math.max(1, minOvertimeMinutes) ? extra : 0;
  return {
    checkInMinute: checkIn,
    checkOutMinute: checkOut,
    missingPunch: false,
    workedMinutes: worked,
    lateMinutes: late,
    earlyLeaveMinutes: early,
    overtimeMinutes: overtime,
  };
}

/** Adds `days` to an ISO date. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Every ISO date from `from` to `to`, inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Days between two ISO dates (b − a). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}
