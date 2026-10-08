import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { parseSnapshot } from '../../../../shared/taxes/line-tax-snapshot';
import { localIsoDate } from '../../../../shared/time/local-date';
import { addDays, openingBalanceEntry } from '../../../../shared/statements/account-statement';
import type { PartyInfo, PartyLedgerSource, PartyLedgerSourceEntry } from '../../../../shared/statements/party-statements';
import { calculatePurchaseInvoiceTotal } from '../../domain/purchase-invoice.entity';

export const SUPPLIER_OPENING_BALANCE_EVENT = 'purchases.supplier.opening_balance_set';

/**
 * The supplier sub-ledger, read straight from Purchases documents: opening
 * balance, posted purchase invoices (له), posted supplier payments (عليه).
 * Drafts and cancelled documents never count.
 */
@Injectable()
export class SupplierLedgerSource implements PartyLedgerSource {
  readonly partyKind = 'supplier' as const;
  readonly table = 'suppliers' as const;
  readonly openingBalanceEvent = SUPPLIER_OPENING_BALANCE_EVENT;

  async findParty(db: Kysely<TenantDatabase>, id: string): Promise<PartyInfo | null> {
    const row = await db
      .selectFrom('suppliers')
      .select(['id', 'name', 'code', 'phone', 'default_currency', 'is_active'])
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toParty(row) : null;
  }

  async listParties(db: Kysely<TenantDatabase>): Promise<PartyInfo[]> {
    const rows = await db
      .selectFrom('suppliers')
      .select(['id', 'name', 'code', 'phone', 'default_currency', 'is_active'])
      .orderBy('name')
      .execute();
    return rows.map(toParty);
  }

  async listEntries(db: Kysely<TenantDatabase>, supplierId: string | null): Promise<PartyLedgerSourceEntry[]> {
    const entries: PartyLedgerSourceEntry[] = [];

    let suppliers = db
      .selectFrom('suppliers')
      .select(['id', 'opening_balance_amount', 'opening_balance_currency', 'opening_balance_date', 'default_currency', 'payment_terms_days']);
    if (supplierId) suppliers = suppliers.where('id', '=', supplierId);
    const supplierRows = await suppliers.execute();
    const terms = new Map(supplierRows.map((s) => [s.id, s.payment_terms_days]));
    for (const s of supplierRows) {
      const opening = openingBalanceEntry(BigInt(s.opening_balance_amount), s.opening_balance_date);
      if (opening) entries.push({ ...opening, partyId: s.id, currency: s.opening_balance_currency ?? s.default_currency });
    }

    let invoices = db
      .selectFrom('purchase_invoices as pi')
      .innerJoin('purchase_orders as po', 'po.id', 'pi.purchase_order_id')
      .select(['pi.id', 'pi.invoice_number', 'pi.supplier_invoice_number', 'pi.invoice_date', 'pi.due_date', 'pi.created_at', 'po.supplier_id'])
      .where('pi.status', '=', 'posted');
    if (supplierId) invoices = invoices.where('po.supplier_id', '=', supplierId);
    const invoiceRows = await invoices.execute();
    if (invoiceRows.length > 0) {
      const lines = await db
        .selectFrom('purchase_invoice_lines')
        .select(['purchase_invoice_id', 'unit_price_amount', 'unit_price_currency', 'quantity_invoiced', 'net_amount', 'taxes'])
        .where('purchase_invoice_id', 'in', invoiceRows.map((i) => i.id))
        .execute();
      const byInvoice = new Map<string, typeof lines>();
      for (const line of lines) {
        const list = byInvoice.get(line.purchase_invoice_id) ?? [];
        list.push(line);
        byInvoice.set(line.purchase_invoice_id, list);
      }
      for (const invoice of invoiceRows) {
        const invoiceLines = byInvoice.get(invoice.id);
        if (!invoiceLines?.length) continue;
        const total = calculatePurchaseInvoiceTotal(
          invoiceLines.map((row) => {
            const unitPrice = Money.fromMinorUnits(BigInt(row.unit_price_amount), row.unit_price_currency);
            return {
              // Lines before migration 0092: no stored net → price × quantity.
              netAmount:
                row.net_amount !== null
                  ? Money.fromMinorUnits(BigInt(row.net_amount), row.unit_price_currency)
                  : unitPrice.multiplyByQuantity(Number(row.quantity_invoiced)),
              taxes: parseSnapshot(row.taxes),
            };
          }),
        );
        const date = invoice.invoice_date ?? localIsoDate(invoice.created_at);
        const termDays = terms.get(invoice.supplier_id);
        entries.push({
          partyId: invoice.supplier_id,
          currency: total.currency,
          date,
          kind: 'purchase_invoice',
          documentId: invoice.id,
          number: invoice.invoice_number,
          reference: invoice.supplier_invoice_number,
          amountMinor: total.toMinorUnits(),
          dueDate: invoice.due_date ?? (termDays ? addDays(date, termDays) : null),
          sequence: invoice.created_at.toISOString(),
        });
      }
    }

    let payments = db
      .selectFrom('supplier_payments')
      .select(['id', 'payment_number', 'supplier_id', 'payment_date', 'reference_number', 'amount_amount', 'amount_currency', 'created_at'])
      .where('status', '=', 'posted');
    if (supplierId) payments = payments.where('supplier_id', '=', supplierId);
    for (const payment of await payments.execute()) {
      entries.push({
        partyId: payment.supplier_id,
        currency: payment.amount_currency,
        date: payment.payment_date ?? localIsoDate(payment.created_at),
        kind: 'supplier_payment',
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
