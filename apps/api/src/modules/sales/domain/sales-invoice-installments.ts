import { BusinessRuleError } from '../../../shared/errors/domain-errors';

/**
 * Installment schedules (التقسيط) on a sales invoice — pure rules, no I/O.
 *
 * A schedule splits the invoice total into dated installments (minor units,
 * bigint). Nothing is posted: the schedule is a collection plan. What has
 * been collected against the invoice (posted receipts + credit notes, the
 * invoice register's paid + credited) is applied to the installments oldest
 * first to compute each one's status on read.
 */

export const MAX_INSTALLMENTS = 120;

export interface InstallmentDraft {
  dueDate: string;
  amountMinor: bigint;
  notes?: string | null;
}

export interface PlannedInstallment {
  sequence: number;
  dueDate: string;
  amountMinor: bigint;
  notes: string | null;
}

export type InstallmentStatus = 'paid' | 'partially_paid' | 'due' | 'overdue';

export interface InstallmentState {
  paidMinor: bigint;
  remainingMinor: bigint;
  status: InstallmentStatus;
  /** Days past due (0 when paid or not yet due). */
  overdueDays: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Adds whole months to an ISO date, clamping to the month's last day
 * (2026-01-31 + 1 month = 2026-02-28).
 */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const monthIndex = m - 1 + months;
  const year = y + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface GenerateInstallmentsInput {
  totalMinor: bigint;
  /** Number of installments after the down payment. */
  count: number;
  firstDueDate: string;
  /** Optional down payment, the first row of the schedule. */
  downPaymentMinor?: bigint;
  /** When the down payment is due (default: the first due date). */
  downPaymentDate?: string;
  /** Months between installments (default 1 = monthly). */
  intervalMonths?: number;
}

/**
 * N equal installments every `intervalMonths` from `firstDueDate`, after an
 * optional down payment. Equal = floor(rest / N); the last one takes the
 * rounding rest so the schedule always sums to the total exactly.
 */
export function generateInstallments(input: GenerateInstallmentsInput): PlannedInstallment[] {
  const { totalMinor, count, firstDueDate } = input;
  const interval = input.intervalMonths ?? 1;
  const down = input.downPaymentMinor ?? 0n;
  if (totalMinor <= 0n) {
    throw new BusinessRuleError('The invoice has no amount to split into installments.', { code: 'SALES_INVOICE_INSTALLMENTS.EMPTY_INVOICE' });
  }
  if (!Number.isInteger(count) || count < 1 || count + (down > 0n ? 1 : 0) > MAX_INSTALLMENTS) {
    throw new BusinessRuleError(`Installment count must be between 1 and ${MAX_INSTALLMENTS}.`, {
      code: 'SALES_INVOICE_INSTALLMENTS.INVALID_COUNT',
      params: { max: MAX_INSTALLMENTS },
    });
  }
  if (!Number.isInteger(interval) || interval < 1 || interval > 12) {
    throw new BusinessRuleError('The interval must be 1–12 months.', { code: 'SALES_INVOICE_INSTALLMENTS.INVALID_INTERVAL' });
  }
  if (!isIsoDate(firstDueDate) || (input.downPaymentDate !== undefined && !isIsoDate(input.downPaymentDate))) {
    throw new BusinessRuleError('Invalid installment date.', { code: 'SALES_INVOICE_INSTALLMENTS.INVALID_DATE' });
  }
  if (down < 0n || down >= totalMinor) {
    throw new BusinessRuleError('The down payment must be less than the invoice total.', {
      code: 'SALES_INVOICE_INSTALLMENTS.DOWN_PAYMENT_TOO_LARGE',
    });
  }
  const rest = totalMinor - down;
  if (rest < BigInt(count)) {
    throw new BusinessRuleError('The amount is too small for that many installments.', { code: 'SALES_INVOICE_INSTALLMENTS.INVALID_COUNT', params: { max: MAX_INSTALLMENTS } });
  }
  const each = rest / BigInt(count);
  const rows: PlannedInstallment[] = [];
  if (down > 0n) rows.push({ sequence: 1, dueDate: input.downPaymentDate ?? firstDueDate, amountMinor: down, notes: null });
  for (let i = 0; i < count; i++) {
    const amount = i === count - 1 ? rest - each * BigInt(count - 1) : each;
    rows.push({ sequence: rows.length + 1, dueDate: addMonths(firstDueDate, i * interval), amountMinor: amount, notes: null });
  }
  return rows;
}

/**
 * Validates a hand-edited schedule against the invoice total and orders it
 * by due date (stable), numbering the rows 1..N. An empty list is valid and
 * means "no schedule".
 */
export function planSchedule(totalMinor: bigint, drafts: readonly InstallmentDraft[]): PlannedInstallment[] {
  if (drafts.length === 0) return [];
  if (drafts.length > MAX_INSTALLMENTS) {
    throw new BusinessRuleError(`At most ${MAX_INSTALLMENTS} installments.`, {
      code: 'SALES_INVOICE_INSTALLMENTS.INVALID_COUNT',
      params: { max: MAX_INSTALLMENTS },
    });
  }
  let sum = 0n;
  for (const draft of drafts) {
    if (!isIsoDate(draft.dueDate)) {
      throw new BusinessRuleError(`Invalid installment date "${draft.dueDate}".`, { code: 'SALES_INVOICE_INSTALLMENTS.INVALID_DATE' });
    }
    if (draft.amountMinor <= 0n) {
      throw new BusinessRuleError('Every installment must be greater than zero.', { code: 'SALES_INVOICE_INSTALLMENTS.INVALID_AMOUNT' });
    }
    sum += draft.amountMinor;
  }
  if (sum !== totalMinor) {
    throw new BusinessRuleError(`Installments sum to ${sum}, the invoice total is ${totalMinor}.`, {
      code: 'SALES_INVOICE_INSTALLMENTS.SUM_MISMATCH',
    });
  }
  return drafts
    .map((draft, index) => ({ draft, index }))
    .sort((a, b) => (a.draft.dueDate === b.draft.dueDate ? a.index - b.index : a.draft.dueDate < b.draft.dueDate ? -1 : 1))
    .map(({ draft }, i) => ({
      sequence: i + 1,
      dueDate: draft.dueDate,
      amountMinor: draft.amountMinor,
      notes: draft.notes?.trim() ? draft.notes.trim() : null,
    }));
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/**
 * Applies what was collected against the invoice to its installments in
 * schedule order (oldest first). An installment past its due date with
 * anything left is overdue, even when partly paid.
 */
export function applyCollections(
  installments: ReadonlyArray<{ dueDate: string; amountMinor: bigint }>,
  collectedMinor: bigint,
  today: string,
): InstallmentState[] {
  let left = collectedMinor > 0n ? collectedMinor : 0n;
  return installments.map((installment) => {
    const paid = left >= installment.amountMinor ? installment.amountMinor : left;
    left -= paid;
    const remaining = installment.amountMinor - paid;
    if (remaining === 0n) return { paidMinor: paid, remainingMinor: 0n, status: 'paid' as const, overdueDays: 0 };
    if (installment.dueDate < today) {
      return { paidMinor: paid, remainingMinor: remaining, status: 'overdue' as const, overdueDays: daysBetween(installment.dueDate, today) };
    }
    return { paidMinor: paid, remainingMinor: remaining, status: paid > 0n ? ('partially_paid' as const) : ('due' as const), overdueDays: 0 };
  });
}

/** The first installment with something left, or null when all are covered. */
export function earliestUnpaidDueDate(
  installments: ReadonlyArray<{ dueDate: string; amountMinor: bigint }>,
  collectedMinor: bigint,
): string | null {
  let left = collectedMinor > 0n ? collectedMinor : 0n;
  for (const installment of installments) {
    if (left >= installment.amountMinor) {
      left -= installment.amountMinor;
      continue;
    }
    return installment.dueDate;
  }
  return null;
}
