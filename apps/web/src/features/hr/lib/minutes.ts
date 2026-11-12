/** Minutes after midnight → "08:05". Past 1440 is the next day: "06:05 (+1)". */
export function formatClock(minute: number | null | undefined, nextDayMark = '+1'): string {
  if (minute === null || minute === undefined) return '—';
  const day = Math.floor(minute / 1440);
  const m = ((minute % 1440) + 1440) % 1440;
  const text = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return day > 0 ? `${text} (${nextDayMark})` : text;
}

/** "08:05" (an <input type="time"> value) → 485; '' → null. */
export function parseClock(value: string): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 485 → "08:05" for an <input type="time">. */
export function clockInput(minute: number | null | undefined): string {
  if (minute === null || minute === undefined) return '';
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 135 → "2:15" (hours:minutes), 0 → "—". */
export function formatDuration(minutes: number): string {
  if (!minutes) return '—';
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** First and last day of the current month (ISO). */
export function currentMonth(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
}
