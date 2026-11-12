/**
 * Reading the date and time cells of a fingerprint-device export (pure). Accepts what real files
 * contain: ISO dates, d/m/y or m/d/y (the caller says which), y/m/d, Excel serial numbers, 24-hour
 * or AM/PM times (Arabic ص/م too), Arabic-Indic digits, and a date-time in one cell.
 */
export type DateFormat = 'dmy' | 'mdy' | 'ymd';

export interface ParsedPunch {
  date: string;
  /** Minutes after midnight. */
  minute: number;
}

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

function westernDigits(text: string): string {
  return text.replace(ARABIC_DIGITS, (c) => String((c.charCodeAt(0) & 0xf) % 10));
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Excel serial day number → ISO date (1900 date system). */
function fromExcelSerial(serial: number): { date: string; minute: number } | null {
  if (!(serial > 20000 && serial < 80000)) return null;
  const ms = Math.round((serial - 25569) * 86_400_000);
  const d = new Date(ms);
  return { date: d.toISOString().slice(0, 10), minute: d.getUTCHours() * 60 + d.getUTCMinutes() + (d.getUTCSeconds() >= 30 ? 1 : 0) };
}

export function parseDate(text: string, format: DateFormat): string | null {
  const t = westernDigits(text).trim();
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const parts = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(t);
  if (parts) {
    const [a, b, c] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    return format === 'mdy' ? validDate(c, a, b) : validDate(c, b, a);
  }
  if (/^\d+(\.\d+)?$/.test(t)) return fromExcelSerial(Number(t))?.date ?? null;
  return null;
}

/** "08:05", "8:05:30", "8:05 PM", "08:05 م", or an Excel day fraction ("0.3368"). */
export function parseTime(text: string): number | null {
  const t = westernDigits(text).trim().toLowerCase();
  if (/^0?\.\d+$/.test(t)) {
    const minutes = Math.round(Number(t) * 1440);
    return minutes >= 0 && minutes < 1440 ? minutes : null;
  }
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|ص|م)?$/.exec(t);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const marker = m[4];
  if (marker) {
    if (hours < 1 || hours > 12) return null;
    const pm = marker === 'pm' || marker === 'م';
    hours = (hours % 12) + (pm ? 12 : 0);
  }
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * One punch from a date cell and an optional time cell. Without a time cell the date cell must hold
 * the time too ("2026-11-03 08:05", "3/11/2026 8:05 ص", or an Excel serial with a fraction).
 */
export function parsePunch(dateCell: string, timeCell: string | undefined, format: DateFormat): ParsedPunch | null {
  const dateText = westernDigits(dateCell).trim();
  if (/^\d+\.\d+$/.test(dateText) && !timeCell?.trim()) return fromExcelSerial(Number(dateText));
  const date = parseDate(dateText, format);
  if (!date) return null;
  let timeText = timeCell?.trim();
  if (!timeText) {
    const rest = /^\S+[\sT]+(.+)$/.exec(dateText);
    if (!rest) return null;
    timeText = rest[1]!;
  }
  const minute = parseTime(timeText);
  return minute === null ? null : { date, minute };
}
