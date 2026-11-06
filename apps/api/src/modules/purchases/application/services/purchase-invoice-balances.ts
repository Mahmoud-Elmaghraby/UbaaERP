import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { documentTotals, parseSnapshot } from '../../../../shared/taxes/line-tax-snapshot';
import { localIsoDate } from '../../../../shared/time/local-date';
import { spreadDebitNoteCredits, type InvoiceForCreditSpread } from '../../domain/purchase-invoice-balance';

export interface PurchaseInvoiceBalance {
  purchaseOrderId: string;
  total: Money;
  /** Allocations of posted supplier payments. */
  paid: Money;
  /** Purchase debit notes credited to this invoice (spread per order, oldest invoice first). */
  debited: Money;
  /** total − paid − debited (never below zero). */
  outstanding: Money;
}

/**
 * Balances of every POSTED purchase invoice of the given purchase orders —
 * the single source for "what is still owed on this invoice" (supplier
 * payment validation and the outstanding-invoices list). The whole order is
 * read, not just the invoices asked about, because a debit note's credit is
 * spread over all of the order's invoices (see spreadDebitNoteCredits).
 * Pass the transaction when the result guards a write.
 */
export async function readPurchaseInvoiceBalances(
  db: Kysely<TenantDatabase>,
  purchaseOrderIds: readonly string[],
): Promise<Map<string, PurchaseInvoiceBalance>> {
  const orderIds = [...new Set(purchaseOrderIds)];
  const result = new Map<string, PurchaseInvoiceBalance>();
  if (orderIds.length === 0) return result;

  const invoices = await db
    .selectFrom('purchase_invoices')
    .select(['id', 'purchase_order_id', 'invoice_date', 'created_at'])
    .where('purchase_order_id', 'in', orderIds)
    .where('status', '=', 'posted')
    .execute();
  if (invoices.length === 0) return result;
  const invoiceIds = invoices.map((i) => i.id);

  const lines = await db
    .selectFrom('purchase_invoice_lines')
    .select(['purchase_invoice_id', 'quantity_invoiced', 'unit_price_amount', 'unit_price_currency', 'net_amount', 'taxes'])
    .where('purchase_invoice_id', 'in', invoiceIds)
    .execute();
  const totals = new Map<string, Money>();
  for (const invoiceId of invoiceIds) {
    const own = lines.filter((l) => l.purchase_invoice_id === invoiceId);
    if (own.length === 0) continue;
    totals.set(
      invoiceId,
      documentTotals(
        own.map((l) => ({
          // Lines before migration 0092 have no stored net: unit price × quantity.
          netAmount:
            l.net_amount !== null
              ? Money.fromMinorUnits(BigInt(l.net_amount), l.unit_price_currency)
              : Money.fromMinorUnits(BigInt(l.unit_price_amount), l.unit_price_currency).multiplyByQuantity(
                  Number(l.quantity_invoiced),
                ),
          taxes: parseSnapshot(l.taxes),
        })),
      ).totalAmount,
    );
  }

  const paidRows = await db
    .selectFrom('supplier_payment_allocations as a')
    .innerJoin('supplier_payments as p', 'p.id', 'a.supplier_payment_id')
    .select(['a.purchase_invoice_id', 'a.allocated_amount_currency', (eb) => eb.fn.sum<string>('a.allocated_amount_amount').as('total')])
    .where('p.status', '=', 'posted')
    .where('a.purchase_invoice_id', 'in', invoiceIds)
    .groupBy(['a.purchase_invoice_id', 'a.allocated_amount_currency'])
    .execute();
  const paid = new Map<string, bigint>();
  for (const row of paidRows) {
    if (row.allocated_amount_currency !== totals.get(row.purchase_invoice_id)?.currency) continue;
    paid.set(row.purchase_invoice_id, (paid.get(row.purchase_invoice_id) ?? 0n) + BigInt(String(row.total).split('.')[0]!));
  }

  const debitedByOrder = await debitNoteTotalsByOrder(db, orderIds);
  const spreadInput: InvoiceForCreditSpread[] = [];
  for (const invoice of invoices) {
    const total = totals.get(invoice.id);
    if (!total) continue;
    const credit = debitedByOrder.get(invoice.purchase_order_id);
    spreadInput.push({
      id: invoice.id,
      purchaseOrderId: invoice.purchase_order_id,
      date: invoice.invoice_date ? calendarDate(invoice.invoice_date) : localIsoDate(invoice.created_at),
      createdAt: invoice.created_at,
      totalMinor: total.toMinorUnits(),
      // A debit note in another currency than the invoice can't be netted against it.
      paidMinor: credit && credit.currency !== total.currency ? total.toMinorUnits() : (paid.get(invoice.id) ?? 0n),
    });
  }
  const credits = spreadDebitNoteCredits(
    spreadInput,
    new Map([...debitedByOrder].map(([orderId, money]) => [orderId, money.toMinorUnits()])),
  );

  for (const invoice of invoices) {
    const total = totals.get(invoice.id);
    if (!total) continue;
    const paidMinor = paid.get(invoice.id) ?? 0n;
    const debitedMinor = credits.get(invoice.id) ?? 0n;
    const outstandingMinor = total.toMinorUnits() - paidMinor - debitedMinor;
    result.set(invoice.id, {
      purchaseOrderId: invoice.purchase_order_id,
      total,
      paid: Money.fromMinorUnits(paidMinor, total.currency),
      debited: Money.fromMinorUnits(debitedMinor, total.currency),
      outstanding: Money.fromMinorUnits(outstandingMinor < 0n ? 0n : outstandingMinor, total.currency),
    });
  }
  return result;
}

/** Issued purchase debit notes' totals (net + taxes) per purchase order, through their order lines. */
async function debitNoteTotalsByOrder(db: Kysely<TenantDatabase>, orderIds: string[]): Promise<Map<string, Money>> {
  const rows = await db
    .selectFrom('purchase_debit_note_lines as l')
    .innerJoin('purchase_debit_notes as n', 'n.id', 'l.purchase_debit_note_id')
    .innerJoin('purchase_order_lines as pol', 'pol.id', 'l.purchase_order_line_id')
    .select(['pol.purchase_order_id', 'n.currency', 'l.net_amount', 'l.taxes'])
    .where('pol.purchase_order_id', 'in', orderIds)
    .execute();
  const byOrder = new Map<string, { netAmount: Money; taxes: ReturnType<typeof parseSnapshot> }[]>();
  for (const row of rows) {
    const list = byOrder.get(row.purchase_order_id) ?? [];
    list.push({ netAmount: Money.fromMinorUnits(BigInt(row.net_amount), row.currency), taxes: parseSnapshot(row.taxes) });
    byOrder.set(row.purchase_order_id, list);
  }
  const result = new Map<string, Money>();
  for (const [orderId, list] of byOrder) result.set(orderId, documentTotals(list).totalAmount);
  return result;
}

/** YYYY-MM-DD of a DATE column (pg may hand it back as a local-midnight Date). */
function calendarDate(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : localIsoDate(value);
}
