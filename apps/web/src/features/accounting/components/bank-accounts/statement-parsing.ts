/** Turning a bank's Excel/CSV export into statement lines — pure, unit-testable. */

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function westernDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))).replace(/٫/g, '.').replace(/٬/g, ',');
}

/** "1,234.50", "(60.00)", "-60", "60-", "1.234,50"? (comma-decimal only when unambiguous) → minor units. Null when not a number. */
export function parseStatementAmount(raw: string | undefined): bigint | null {
  if (!raw) return null;
  let text = westernDigits(raw).replace(/[\s\u00a0]/g, '').replace(/[^\d.,()\-+]/g, '');
  if (text === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.endsWith('-')) {
    negative = true;
    text = text.slice(0, -1);
  }
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith('+')) text = text.slice(1);
  // "1.234,50" (European) when the comma is the last separator with 2 digits after it.
  if (/,\d{1,2}$/.test(text) && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else text = text.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const minor = BigInt(whole!) * 100n + BigInt((fraction + '00').slice(0, 2));
  return negative ? -minor : minor;
}

/** ISO, d/m/y (or d-m-y, d.m.y), y/m/d, or an Excel serial day number → 'YYYY-MM-DD'. Null when not a date. */
export function parseStatementDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const text = westernDigits(raw).trim();
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(text);
  let y: number;
  let m: number;
  let d: number;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3])];
  else if (/^\d{5}(\.\d+)?$/.test(text)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(text)) * 86_400_000);
    [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface StatementMapping {
  dateCol: number;
  descriptionCol: number;
  referenceCol: number;
  /** One signed amount column … */
  amountCol: number;
  /** … or separate deposit / withdrawal columns (used when amountCol is -1). */
  depositCol: number;
  withdrawalCol: number;
}

export interface ParsedStatementLine {
  date: string;
  description: string | null;
  reference: string | null;
  amountMinorUnits: string;
}

/** Guesses the columns from the header row (Arabic or English bank headers). */
export function guessMapping(header: string[]): StatementMapping {
  const find = (...patterns: RegExp[]) => header.findIndex((h) => patterns.some((p) => p.test(h)));
  const amountCol = find(/^amount$/i, /^المبلغ$/, /القيمة/);
  return {
    dateCol: find(/date/i, /تاريخ/),
    descriptionCol: find(/desc|details|narrative|particular/i, /البيان|الوصف|التفاصيل|شرح/),
    referenceCol: find(/ref|cheque|check/i, /مرجع|رقم الشيك|المرجع/),
    amountCol,
    depositCol: amountCol >= 0 ? -1 : find(/credit|deposit/i, /دائن|إيداع|ايداع|وارد/),
    withdrawalCol: amountCol >= 0 ? -1 : find(/debit|withdraw/i, /مدين|سحب|صادر/),
  };
}

export function parseStatement(rows: string[][], mapping: StatementMapping): { lines: ParsedStatementLine[]; skipped: number } {
  const lines: ParsedStatementLine[] = [];
  let skipped = 0;
  for (const row of rows) {
    const date = parseStatementDate(row[mapping.dateCol]);
    let amount: bigint | null;
    if (mapping.amountCol >= 0) amount = parseStatementAmount(row[mapping.amountCol]);
    else {
      const deposit = parseStatementAmount(row[mapping.depositCol]) ?? 0n;
      const withdrawal = parseStatementAmount(row[mapping.withdrawalCol]) ?? 0n;
      amount = deposit - (withdrawal < 0n ? -withdrawal : withdrawal);
    }
    if (!date || amount === null || amount === 0n) {
      skipped += 1;
      continue;
    }
    const text = (col: number) => (col >= 0 && row[col] ? row[col]!.slice(0, col === mapping.referenceCol ? 120 : 500) : null);
    lines.push({ date, description: text(mapping.descriptionCol), reference: text(mapping.referenceCol), amountMinorUnits: amount.toString() });
  }
  return { lines, skipped };
}
