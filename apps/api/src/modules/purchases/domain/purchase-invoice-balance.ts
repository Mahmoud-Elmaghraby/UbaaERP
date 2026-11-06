/**
 * What is still owed on a posted purchase invoice: total − posted supplier
 * payments' allocations − the purchase debit notes credited to it.
 *
 * A debit note (إشعار خصم مورد, migration 0096) is not tied to a single
 * invoice — it comes from a purchase return, which belongs to a purchase
 * order. So the debit-note credit of an order is spread over that order's
 * posted invoices oldest first, each taking at most what is still unpaid on
 * it (the same rule as Sales' credit notes in the sales register). Credit
 * left over once every invoice of the order is settled is the supplier's
 * credit balance (supplier statement), not a negative outstanding.
 */
export interface InvoiceForCreditSpread {
  id: string;
  purchaseOrderId: string;
  /** Business date used for "oldest first" (invoice date, else creation date). */
  date: string;
  createdAt: Date;
  totalMinor: bigint;
  paidMinor: bigint;
}

/** Debit-note credit per invoice id (minor units; invoices that get none are absent). */
export function spreadDebitNoteCredits(
  invoices: readonly InvoiceForCreditSpread[],
  creditByOrder: ReadonlyMap<string, bigint>,
): Map<string, bigint> {
  const left = new Map(creditByOrder);
  const ordered = [...invoices].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const result = new Map<string, bigint>();
  for (const invoice of ordered) {
    const available = left.get(invoice.purchaseOrderId) ?? 0n;
    if (available <= 0n) continue;
    const unpaid = invoice.totalMinor - invoice.paidMinor;
    if (unpaid <= 0n) continue;
    const credited = available < unpaid ? available : unpaid;
    left.set(invoice.purchaseOrderId, available - credited);
    result.set(invoice.id, credited);
  }
  return result;
}
