import { toIsoDate } from '../../../../lib/format-date';

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** The period of the same shape just before [from, to]: a whole month → the previous month, a year → the previous year, else the same number of days. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const start = parse(from);
  const end = parse(to);
  const wholeMonths =
    start.getDate() === 1 && new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getDate() === 1;
  if (wholeMonths) {
    const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
    return {
      from: toIsoDate(new Date(start.getFullYear(), start.getMonth() - months, 1)),
      to: toIsoDate(new Date(start.getFullYear(), start.getMonth(), 0)),
    };
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return {
    from: toIsoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() - days)),
    to: toIsoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1)),
  };
}

/** Same date one year earlier. */
export function sameDateLastYear(date: string): string {
  const d = parse(date);
  return toIsoDate(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()));
}
