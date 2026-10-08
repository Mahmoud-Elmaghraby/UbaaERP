/**
 * Account statement (كشف حساب) and aging for customers and suppliers,
 * computed from the documents themselves — NOT from journal entries — so
 * they work whether or not the Accounting module is enabled. Sales and
 * Purchases each turn their own documents into PartyLedgerEntry rows; this
 * file only does the arithmetic, identically for both.
 *
 * Amounts are signed minor units in the party's own sense:
 *   `amountMinor > 0` increases what is owed (a sales invoice for a
 *   customer, a purchase invoice for a supplier); `< 0` decreases it
 *   (a receipt, a credit note, a payment to a supplier).
 */
export type PartyLedgerKind =
  | 'opening_balance'
  | 'sales_invoice'
  | 'sales_credit_note'
  | 'payment_received'
  | 'purchase_invoice'
  | 'supplier_payment';

export interface PartyLedgerEntry<K extends string = PartyLedgerKind> {
  /** ISO date (YYYY-MM-DD) the entry counts from. */
  date: string;
  /** What the entry is (a document type, or 'opening_balance'). */
  kind: K | 'opening_balance';
  documentId: string | null;
  number: string;
  /** A second reference to show (the supplier's own invoice number, a cheque number…). */
  reference: string | null;
  amountMinor: bigint;
  /** Free text shown with the entry (a treasury movement's description). */
  description?: string | null;
  /** Invoices only — when it falls due (aging). Null = due on its date. */
  dueDate: string | null;
  /** Tie-breaker for entries on the same date (creation time, ISO). */
  sequence: string;
}

export interface StatementRow<K extends string = PartyLedgerKind> extends PartyLedgerEntry<K> {
  /** Increase of the balance (عليه for a customer / له for a supplier). */
  increaseMinor: bigint;
  decreaseMinor: bigint;
  balanceMinor: bigint;
}

export interface AccountStatement<K extends string = PartyLedgerKind> {
  from: string | null;
  to: string | null;
  openingBalanceMinor: bigint;
  rows: StatementRow<K>[];
  totalIncreaseMinor: bigint;
  totalDecreaseMinor: bigint;
  closingBalanceMinor: bigint;
}

const EPOCH = '0001-01-01';

export function sortEntries<E extends PartyLedgerEntry<string>>(entries: readonly E[]): E[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    // The opening balance always comes first on its date.
    if ((a.kind === 'opening_balance') !== (b.kind === 'opening_balance')) return a.kind === 'opening_balance' ? -1 : 1;
    return a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0;
  });
}

/**
 * Everything before `from` collapses into the opening balance; rows between
 * `from` and `to` (inclusive) carry a running balance; anything after `to`
 * is ignored.
 */
export function buildAccountStatement<K extends string = PartyLedgerKind>(
  entries: readonly PartyLedgerEntry<K>[],
  range: { from?: string | null; to?: string | null } = {},
): AccountStatement<K> {
  const from = range.from ?? null;
  const to = range.to ?? null;
  let balance = 0n;
  let opening = 0n;
  let totalIncrease = 0n;
  let totalDecrease = 0n;
  const rows: StatementRow<K>[] = [];

  for (const entry of sortEntries(entries)) {
    if (to && entry.date > to) break;
    if (from && entry.date < from) {
      opening += entry.amountMinor;
      balance += entry.amountMinor;
      continue;
    }
    balance += entry.amountMinor;
    const increase = entry.amountMinor > 0n ? entry.amountMinor : 0n;
    const decrease = entry.amountMinor < 0n ? -entry.amountMinor : 0n;
    totalIncrease += increase;
    totalDecrease += decrease;
    rows.push({ ...entry, increaseMinor: increase, decreaseMinor: decrease, balanceMinor: balance });
  }

  return {
    from,
    to,
    openingBalanceMinor: opening,
    rows,
    totalIncreaseMinor: totalIncrease,
    totalDecreaseMinor: totalDecrease,
    closingBalanceMinor: balance,
  };
}

export interface AgingBuckets {
  /** Not yet due (or due today). */
  currentMinor: bigint;
  days1To30Minor: bigint;
  days31To60Minor: bigint;
  days61To90Minor: bigint;
  over90Minor: bigint;
  totalMinor: bigint;
  /** Credit the party holds beyond everything owed (advance/overpayment) — reported, not aged. */
  unappliedCreditMinor: bigint;
}

/**
 * Balance-forward aging, the way traditional systems age a running account:
 * every decrease (payment, credit note) settles the OLDEST increases first;
 * what remains of each increase is aged by days past its due date.
 * Independent of how payments were allocated to individual invoices, so an
 * unallocated payment or an opening balance age correctly too.
 */
export function ageBalance(entries: readonly PartyLedgerEntry<string>[], asOf: string): AgingBuckets {
  const relevant = sortEntries(entries).filter((entry) => entry.date <= asOf);
  let credit = 0n;
  for (const entry of relevant) if (entry.amountMinor < 0n) credit += -entry.amountMinor;

  const buckets: AgingBuckets = {
    currentMinor: 0n,
    days1To30Minor: 0n,
    days31To60Minor: 0n,
    days61To90Minor: 0n,
    over90Minor: 0n,
    totalMinor: 0n,
    unappliedCreditMinor: 0n,
  };

  for (const entry of relevant) {
    if (entry.amountMinor <= 0n) continue;
    const settled = credit >= entry.amountMinor ? entry.amountMinor : credit;
    credit -= settled;
    const open = entry.amountMinor - settled;
    if (open === 0n) continue;
    const overdue = daysBetween(entry.dueDate ?? entry.date, asOf);
    if (overdue <= 0) buckets.currentMinor += open;
    else if (overdue <= 30) buckets.days1To30Minor += open;
    else if (overdue <= 60) buckets.days31To60Minor += open;
    else if (overdue <= 90) buckets.days61To90Minor += open;
    else buckets.over90Minor += open;
    buckets.totalMinor += open;
  }
  buckets.unappliedCreditMinor = credit;
  return buckets;
}

/** Whole days from `from` to `to` (ISO dates, calendar arithmetic in UTC). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** The opening balance as a ledger entry (dated first if no date was given). */
export function openingBalanceEntry(amountMinor: bigint, date: string | null): PartyLedgerEntry<never> | null {
  if (amountMinor === 0n) return null;
  return {
    date: date ?? EPOCH,
    kind: 'opening_balance',
    documentId: null,
    number: '',
    reference: null,
    amountMinor,
    dueDate: null,
    sequence: '',
  };
}

/** Adds a number of days to an ISO date. */
export function addDays(date: string, days: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + days));
  return d.toISOString().slice(0, 10);
}
