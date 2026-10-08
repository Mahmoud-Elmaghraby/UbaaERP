import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { parseSnapshot } from '../../../../shared/taxes/line-tax-snapshot';
import { localIsoDate } from '../../../../shared/time/local-date';
import { addDays, openingBalanceEntry } from '../../../../shared/statements/account-statement';
import type { PartyInfo, PartyLedgerSource, PartyLedgerSourceEntry } from '../../../../shared/statements/party-statements';
import { calculateSalesInvoiceTotal } from '../../domain/sales-invoice.entity';
import { calculateSalesCreditNoteTotals } from '../../domain/sales-credit-note.entity';

export const CUSTOMER_OPENING_BALANCE_EVENT = 'sales.customer.opening_balance_set';

type LineRow = { unit_price_amount: string; unit_price_currency: string; quantity: string; net_amount: string | null; taxes: unknown };

/** Same rule as the line repositories: lines before migration 0092 have no stored net → price × quantity. */
function lineForTotals(row: LineRow) {
  const unitPrice = Money.fromMinorUnits(BigInt(row.unit_price_amount), row.unit_price_currency);
  return {
    netAmount:
      row.net_amount !== null
        ? Money.fromMinorUnits(BigInt(row.net_amount), row.unit_price_currency)
        : unitPrice.multiplyByQuantity(Number(row.quantity)),
    taxes: parseSnapshot(row.taxes),
  };
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  }
  return map;
}

/**
 * The customer sub-ledger, read straight from Sales documents: opening
 * balance, posted invoices (incl. POS sales), credit notes, posted receipts.
 * Drafts and cancelled documents never count.
 */
@Injectable()
export class CustomerLedgerSource implements PartyLedgerSource {
  readonly partyKind = 'customer' as const;
  readonly table = 'customers' as const;
  readonly openingBalanceEvent = CUSTOMER_OPENING_BALANCE_EVENT;

  async findParty(db: Kysely<TenantDatabase>, id: string): Promise<PartyInfo | null> {
    const row = await db
      .selectFrom('customers')
      .select(['id', 'name', 'code', 'phone', 'default_currency', 'is_active'])
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toParty(row) : null;
  }

  async listParties(db: Kysely<TenantDatabase>): Promise<PartyInfo[]> {
    const rows = await db
      .selectFrom('customers')
      .select(['id', 'name', 'code', 'phone', 'default_currency', 'is_active'])
      .orderBy('name')
      .execute();
    return rows.map(toParty);
  }

  async listEntries(db: Kysely<TenantDatabase>, customerId: string | null): Promise<PartyLedgerSourceEntry[]> {
    const entries: PartyLedgerSourceEntry[] = [];

    // Opening balances.
    let customers = db
      .selectFrom('customers')
      .select(['id', 'opening_balance_amount', 'opening_balance_currency', 'opening_balance_date', 'default_currency', 'payment_terms_days']);
    if (customerId) customers = customers.where('id', '=', customerId);
    const customerRows = await customers.execute();
    const terms = new Map(customerRows.map((c) => [c.id, c.payment_terms_days]));
    for (const c of customerRows) {
      const opening = openingBalanceEntry(BigInt(c.opening_balance_amount), c.opening_balance_date);
      if (opening) entries.push({ ...opening, partyId: c.id, currency: c.opening_balance_currency ?? c.default_currency });
    }

    // Posted sales invoices (a POS sale is one too).
    let invoices = db
      .selectFrom('sales_invoices as si')
      .innerJoin('sales_orders as so', 'so.id', 'si.sales_order_id')
      .select(['si.id', 'si.invoice_number', 'si.invoice_date', 'si.due_date', 'si.created_at', 'so.customer_id'])
      .where('si.status', '=', 'posted');
    if (customerId) invoices = invoices.where('so.customer_id', '=', customerId);
    const invoiceRows = await invoices.execute();
    if (invoiceRows.length > 0) {
      const lines = await db
        .selectFrom('sales_invoice_lines')
        .select(['sales_invoice_id', 'unit_price_amount', 'unit_price_currency', 'quantity_invoiced as quantity', 'net_amount', 'taxes'])
        .where('sales_invoice_id', 'in', invoiceRows.map((i) => i.id))
        .execute();
      const linesByInvoice = groupBy(lines, (l) => l.sales_invoice_id);
      for (const invoice of invoiceRows) {
        const invoiceLines = linesByInvoice.get(invoice.id);
        if (!invoiceLines?.length) continue;
        const total = calculateSalesInvoiceTotal(invoiceLines.map(lineForTotals));
        const date = invoice.invoice_date ?? localIsoDate(invoice.created_at);
        const termDays = terms.get(invoice.customer_id);
        entries.push({
          partyId: invoice.customer_id,
          currency: total.currency,
          date,
          kind: 'sales_invoice',
          documentId: invoice.id,
          number: invoice.invoice_number,
          reference: null,
          amountMinor: total.toMinorUnits(),
          dueDate: invoice.due_date ?? (termDays ? addDays(date, termDays) : null),
          sequence: invoice.created_at.toISOString(),
        });
      }
    }

    // Credit notes (issued on creation — there is no draft state).
    let creditNotes = db
      .selectFrom('sales_credit_notes')
      .select(['id', 'credit_note_number', 'customer_id', 'created_at']);
    if (customerId) creditNotes = creditNotes.where('customer_id', '=', customerId);
    const creditNoteRows = await creditNotes.execute();
    if (creditNoteRows.length > 0) {
      const lines = await db
        .selectFrom('sales_credit_note_lines')
        .select(['sales_credit_note_id', 'unit_price_amount', 'unit_price_currency', 'quantity', 'net_amount', 'taxes'])
        .where('sales_credit_note_id', 'in', creditNoteRows.map((c) => c.id))
        .execute();
      const linesByNote = groupBy(lines, (l) => l.sales_credit_note_id);
      for (const note of creditNoteRows) {
        const noteLines = linesByNote.get(note.id);
        if (!noteLines?.length) continue;
        const total = calculateSalesCreditNoteTotals(noteLines.map(lineForTotals)).totalAmount;
        entries.push({
          partyId: note.customer_id,
          currency: total.currency,
          date: localIsoDate(note.created_at),
          kind: 'sales_credit_note',
          documentId: note.id,
          number: note.credit_note_number,
          reference: null,
          amountMinor: -total.toMinorUnits(),
          dueDate: null,
          sequence: note.created_at.toISOString(),
        });
      }
    }

    // Posted receipts.
    let payments = db
      .selectFrom('payments_received')
      .select(['id', 'payment_number', 'customer_id', 'payment_date', 'reference_number', 'amount_amount', 'amount_currency', 'created_at'])
      .where('status', '=', 'posted');
    if (customerId) payments = payments.where('customer_id', '=', customerId);
    for (const payment of await payments.execute()) {
      entries.push({
        partyId: payment.customer_id,
        currency: payment.amount_currency,
        date: payment.payment_date ?? localIsoDate(payment.created_at),
        kind: 'payment_received',
        documentId: payment.id,
        number: payment.payment_number,
        reference: payment.reference_number,
        amountMinor: -BigInt(payment.amount_amount),
        dueDate: null,
        sequence: payment.created_at.toISOString(),
      });
    }

    return entries;
  }
}

function toParty(row: { id: string; name: string; code: string; phone: string | null; default_currency: string; is_active: boolean }): PartyInfo {
  return { id: row.id, name: row.name, code: row.code, phone: row.phone, defaultCurrency: row.default_currency, isActive: row.is_active };
}
