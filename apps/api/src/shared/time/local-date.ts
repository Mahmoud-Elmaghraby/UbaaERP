/**
 * 'YYYY-MM-DD' of a moment in the server's local time zone — the business
 * date. `toISOString().slice(0, 10)` gives the UTC date instead, which in
 * Egypt (UTC+2/+3) dates everything between midnight and 2–3 am on the
 * previous day (and can land a journal entry in the previous month/period).
 */
export function localIsoDate(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
