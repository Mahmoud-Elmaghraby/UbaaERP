/**
 * Splits a fiscal year's date range into one accounting period per
 * calendar month, clipped to the fiscal year's own start/end so a
 * non-calendar-aligned fiscal year (e.g. starting 1 July) still gets
 * clean period boundaries without bleeding into the next fiscal year.
 * Pure function, no I/O — called by FiscalYearsService.create() inside
 * its own transaction.
 */

const ARABIC_MONTH_NAMES = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

export interface GeneratedPeriod {
  name: string;
  startDate: string;
  endDate: string;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function generateMonthlyPeriods(startDate: string, endDate: string): GeneratedPeriod[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const periods: GeneratedPeriod[] = [];

  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));

  while (cursor <= end) {
    const monthStart = cursor > start ? cursor : start;
    const monthEndRaw = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const monthEnd = monthEndRaw < end ? monthEndRaw : end;

    periods.push({
      name: `${ARABIC_MONTH_NAMES[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
      startDate: toDateOnly(monthStart),
      endDate: toDateOnly(monthEnd),
    });

    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return periods;
}
