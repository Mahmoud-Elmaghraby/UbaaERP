/** Date-only ('YYYY-MM-DD') helpers for schedules — no time zones involved. */

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y!, m!, d!];
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** date + n months, the day clamped to the target month (31 Jan + 1 → 28/29 Feb). */
export function addMonthsClamped(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const index = y * 12 + (m - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  return iso(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

/** Last day of the date's month. */
export function monthEnd(date: string): string {
  const [y, m] = parts(date);
  return iso(y, m, daysInMonth(y, m));
}

/** Last day of the month before the date's month. */
export function previousMonthEnd(date: string): string {
  const [y, m] = parts(date);
  return m === 1 ? iso(y - 1, 12, 31) : iso(y, m - 1, daysInMonth(y, m - 1));
}

/** Month ends from the month of `from` through the month of `to`, both inclusive. */
export function monthEndsBetween(from: string, to: string): string[] {
  const result: string[] = [];
  let current = monthEnd(from);
  const last = monthEnd(to);
  while (current <= last) {
    result.push(current);
    current = monthEnd(addMonthsClamped(current.slice(0, 8) + '01', 1));
  }
  return result;
}
