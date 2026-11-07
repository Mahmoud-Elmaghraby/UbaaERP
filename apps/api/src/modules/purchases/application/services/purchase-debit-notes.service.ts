import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { computeLineTaxes, Money, type TaxRateInput } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import {
  documentTotals,
  parseSnapshot,
  toSnapshot,
  totalsToDto,
  type DocumentTotals,
  type LineTaxSnapshot,
} from '../../../../shared/taxes/line-tax-snapshot';
import { localIsoDate } from '../../../../shared/time/local-date';
import { lockRowsForUpdate } from '../../../../shared/persistence/row-locks';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { NotFoundError } from '../errors';

export const PURCHASE_DEBIT_NOTE_ISSUED = 'purchases.purchase_debit_note.issued';

interface ReturnLineInput {
  id: string;
  goodsReceiptLineId: string;
  productVariantId: string;
  quantityReturned: number;
  unitFactor: number;
}

export interface IssuedDebitNote {
  id: string;
  debitNoteNumber: string;
  /** Base units of each return line the note covers (its invoiced part); the rest was never invoiced. */
  coveredBaseQuantity: ReadonlyMap<string, number>;
}

interface InvoicedLine {
  net: Money;
  baseQuantity: number;
  /** Tax rates of the latest posted invoice line for this order line (the one being reversed first). */
  rates: TaxRateInput[];
  /** Date of that latest posted invoice — the rate the payable entered the ledger at. */
  invoiceDate: string;
}

/**
 * The supplier side of a purchase return (إشعار خصم مورد).
 *
 * Only the INVOICED part of a returned quantity is owed back by the
 * supplier — goods returned before they were invoiced never became a
 * payable (their receipt and return cancel out in GRNI). So per purchase
 * order line: creditable = min(returned, invoiced − already debited), priced
 * at the posted invoices' own net and tax rates, pro rata — which makes the
 * note an exact reversal of its share of the invoice (VAT, table tax and
 * withholding included).
 *
 * Called inside the return's confirmation transaction; the outbox event
 * carries the same totals shape as `purchases.purchase_invoice.posted`, so
 * Accounting reverses it line for line.
 */
@Injectable()
export class PurchaseDebitNotesService {
  constructor(
    private readonly numbering: NumberingSequencesService,
    private readonly outbox: OutboxWriterService,
  ) {}

  async issueForReturn(
    trx: Kysely<TenantDatabase>,
    purchaseReturn: { id: string; returnNumber: string; returnDate: string | null },
    returnLines: readonly ReturnLineInput[],
    context: { schema: string; actorUserId: string | null },
  ): Promise<IssuedDebitNote | null> {
    if (returnLines.length === 0) return null;
    const receiptLines = await trx
      .selectFrom('goods_receipt_lines as grl')
      .innerJoin('goods_receipts as gr', 'gr.id', 'grl.goods_receipt_id')
      .innerJoin('purchase_orders as po', 'po.id', 'gr.purchase_order_id')
      .select(['grl.id', 'grl.purchase_order_line_id', 'po.supplier_id'])
      .where('grl.id', 'in', returnLines.map((line) => line.goodsReceiptLineId))
      .execute();
    const receiptLineById = new Map(receiptLines.map((row) => [row.id, row]));
    const supplierId = receiptLines[0]?.supplier_id;
    if (!supplierId) return null;

    const poLineIds = [...new Set(receiptLines.map((row) => row.purchase_order_line_id))];
    // Two returns of the same order line confirmed at once: the second waits here and then sees the
    // first one's debit note lines, so the invoiced quantity can't be debited twice.
    await lockRowsForUpdate(trx, 'purchase_order_lines', poLineIds);
    const invoiced = await this.invoicedByOrderLine(trx, poLineIds);
    const debited = await this.debitedByOrderLine(trx, poLineIds);

    const lines: {
      returnLineId: string;
      poLineId: string;
      productVariantId: string;
      baseQuantity: number;
      net: Money;
      taxes: LineTaxSnapshot[];
      sourceInvoiceDate: string;
    }[] = [];
    for (const returnLine of returnLines) {
      const poLineId = receiptLineById.get(returnLine.goodsReceiptLineId)?.purchase_order_line_id;
      const source = poLineId ? invoiced.get(poLineId) : undefined;
      if (!poLineId || !source || source.baseQuantity <= 0) continue;
      const available = source.baseQuantity - (debited.get(poLineId) ?? 0);
      const baseQuantity = round4(Math.min(returnLine.quantityReturned * returnLine.unitFactor, available));
      if (baseQuantity <= 0) continue;
      debited.set(poLineId, (debited.get(poLineId) ?? 0) + baseQuantity);
      const net = source.net.multiplyByQuantity(baseQuantity / source.baseQuantity);
      lines.push({
        returnLineId: returnLine.id,
        poLineId,
        productVariantId: returnLine.productVariantId,
        baseQuantity,
        net,
        taxes: toSnapshot(computeLineTaxes(net.toMinorUnits(), source.rates).taxes),
        sourceInvoiceDate: source.invoiceDate,
      });
    }
    if (lines.length === 0) return null;

    const id = randomUUID();
    const date = purchaseReturn.returnDate ?? localIsoDate();
    const currency = lines[0]!.net.currency;
    const number = await this.numbering.allocateNext(trx, 'purchase_debit_note', null);
    await trx
      .insertInto('purchase_debit_notes')
      .values({
        id,
        debit_note_number: number.formatted,
        purchase_return_id: purchaseReturn.id,
        supplier_id: supplierId,
        debit_note_date: date,
        currency,
      })
      .execute();
    await trx
      .insertInto('purchase_debit_note_lines')
      .values(
        lines.map((line) => ({
          id: randomUUID(),
          purchase_debit_note_id: id,
          purchase_return_line_id: line.returnLineId,
          purchase_order_line_id: line.poLineId,
          product_variant_id: line.productVariantId,
          base_quantity: String(line.baseQuantity),
          net_amount: line.net.toMinorUnits().toString(),
          taxes: JSON.stringify(line.taxes),
        })),
      )
      .execute();

    const totals = documentTotals(lines.map((line) => ({ netAmount: line.net, taxes: line.taxes })));
    const sourceInvoiceDate = lines.map((line) => line.sourceInvoiceDate).sort().at(-1)!;
    await this.outbox.write(trx, PURCHASE_DEBIT_NOTE_ISSUED, {
      schema: context.schema,
      entityType: 'purchase_debit_note',
      entityId: id,
      action: 'issued',
      actorUserId: context.actorUserId,
      occurredAt: new Date(),
      metadata: {
        purchaseReturnId: purchaseReturn.id,
        returnNumber: purchaseReturn.returnNumber,
        supplierId,
        // Same shape as purchases.purchase_invoice.posted (Accounting reverses it).
        invoiceNumber: number.formatted,
        invoiceDate: date,
        /**
         * Date of the (latest) posted purchase invoice this note reverses. The payable was booked
         * at that date's exchange rate, so Accounting converts a foreign-currency note at it (and
         * each stock line at its own line's sourceInvoiceDate, as Inventory does) — the entry is
         * still dated invoiceDate (the note's own date).
         */
        sourceInvoiceDate,
        supplierInvoiceNumber: null,
        ...totalsToDto(totals),
        lines: lines.map((line) => ({
          productVariantId: line.productVariantId,
          quantity: line.baseQuantity,
          netAmount: { amountMinorUnits: line.net.toMinorUnits().toString(), currency: line.net.currency },
          taxes: line.taxes,
          sourceInvoiceDate: line.sourceInvoiceDate,
        })),
      },
    });
    const coveredBaseQuantity = new Map<string, number>();
    for (const line of lines) {
      coveredBaseQuantity.set(line.returnLineId, round4((coveredBaseQuantity.get(line.returnLineId) ?? 0) + line.baseQuantity));
    }
    return { id, debitNoteNumber: number.formatted, coveredBaseQuantity };
  }

  /**
   * Posted invoices' net and base quantity per purchase order line, with the tax rates and date of
   * the LATEST posted invoice line for it (a later invoice may carry a different tax rule).
   */
  private async invoicedByOrderLine(trx: Kysely<TenantDatabase>, poLineIds: string[]): Promise<Map<string, InvoicedLine>> {
    const result = new Map<string, InvoicedLine>();
    if (poLineIds.length === 0) return result;
    const rows = await trx
      .selectFrom('purchase_invoice_lines as l')
      .innerJoin('purchase_invoices as i', 'i.id', 'l.purchase_invoice_id')
      .select(['l.purchase_order_line_id', 'l.quantity_invoiced', 'l.unit_factor', 'l.unit_price_amount', 'l.unit_price_currency', 'l.net_amount', 'l.taxes', 'i.invoice_date', 'i.created_at'])
      .where('i.status', '=', 'posted')
      .where('l.purchase_order_line_id', 'in', poLineIds)
      .orderBy(sql`COALESCE(i.invoice_date, i.created_at::date)`)
      .orderBy('i.created_at')
      .orderBy('l.created_at')
      .execute();
    for (const row of rows) {
      const quantity = Number(row.quantity_invoiced);
      // Lines before migration 0092 have no stored net: unit price × quantity.
      const net =
        row.net_amount !== null
          ? Money.fromMinorUnits(BigInt(row.net_amount), row.unit_price_currency)
          : Money.fromMinorUnits(BigInt(row.unit_price_amount), row.unit_price_currency).multiplyByQuantity(quantity);
      const baseQuantity = quantity * Number(row.unit_factor);
      // Rows come oldest invoice first: the last one seen sets the rates and the date.
      const rates = parseSnapshot(row.taxes).map((tax) => ({
        taxRuleId: tax.taxRuleId,
        name: tax.name,
        kind: tax.kind,
        rate: tax.rate,
        etaType: tax.etaType,
        etaSubtype: tax.etaSubtype,
      }));
      const invoiceDate = row.invoice_date ? calendarDate(row.invoice_date) : localIsoDate(row.created_at);
      const entry = result.get(row.purchase_order_line_id);
      if (entry) {
        entry.net = entry.net.add(net);
        entry.baseQuantity += baseQuantity;
        entry.rates = rates;
        entry.invoiceDate = invoiceDate;
      } else {
        result.set(row.purchase_order_line_id, { net, baseQuantity, rates, invoiceDate });
      }
    }
    return result;
  }

  /** Notes with their totals, newest first (optionally one supplier's or one return's). */
  async list(
    db: Kysely<TenantDatabase>,
    filter: { supplierId?: string; purchaseReturnId?: string } = {},
  ): Promise<DebitNoteRecord[]> {
    let query = db
      .selectFrom('purchase_debit_notes as dn')
      .innerJoin('purchase_returns as pr', 'pr.id', 'dn.purchase_return_id')
      .select(['dn.id', 'dn.debit_note_number', 'dn.purchase_return_id', 'dn.supplier_id', 'dn.debit_note_date', 'dn.currency', 'dn.created_at', 'pr.return_number'])
      .orderBy('dn.created_at', 'desc');
    if (filter.supplierId) query = query.where('dn.supplier_id', '=', filter.supplierId);
    if (filter.purchaseReturnId) query = query.where('dn.purchase_return_id', '=', filter.purchaseReturnId);
    const notes = await query.execute();
    if (notes.length === 0) return [];
    const lines = await this.noteLines(db, notes.map((n) => n.id));
    return notes.map((note) => toRecord(note, lines.filter((line) => line.purchase_debit_note_id === note.id)));
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<DebitNoteRecord> {
    const note = await db
      .selectFrom('purchase_debit_notes as dn')
      .innerJoin('purchase_returns as pr', 'pr.id', 'dn.purchase_return_id')
      .select(['dn.id', 'dn.debit_note_number', 'dn.purchase_return_id', 'dn.supplier_id', 'dn.debit_note_date', 'dn.currency', 'dn.created_at', 'pr.return_number'])
      .where('dn.id', '=', id)
      .executeTakeFirst();
    if (!note) {
      throw new NotFoundError(`Purchase debit note "${id}" was not found.`, { code: 'PURCHASE_DEBIT_NOTE.NOT_FOUND' });
    }
    return toRecord(note, await this.noteLines(db, [note.id]));
  }

  private noteLines(db: Kysely<TenantDatabase>, noteIds: string[]) {
    return db
      .selectFrom('purchase_debit_note_lines')
      .select(['id', 'purchase_debit_note_id', 'purchase_return_line_id', 'purchase_order_line_id', 'product_variant_id', 'base_quantity', 'net_amount', 'taxes'])
      .where('purchase_debit_note_id', 'in', noteIds)
      .orderBy('id')
      .execute();
  }

  private async debitedByOrderLine(trx: Kysely<TenantDatabase>, poLineIds: string[]): Promise<Map<string, number>> {
    if (poLineIds.length === 0) return new Map();
    const rows = await trx
      .selectFrom('purchase_debit_note_lines')
      .select(['purchase_order_line_id', (eb) => eb.fn.sum<string>('base_quantity').as('quantity')])
      .where('purchase_order_line_id', 'in', poLineIds)
      .groupBy('purchase_order_line_id')
      .execute();
    return new Map(rows.map((row) => [row.purchase_order_line_id, Number(row.quantity)]));
  }
}

export interface DebitNoteLineRecord {
  id: string;
  purchaseReturnLineId: string;
  purchaseOrderLineId: string;
  productVariantId: string;
  baseQuantity: number;
  netAmount: Money;
  taxes: LineTaxSnapshot[];
}

export interface DebitNoteRecord {
  id: string;
  debitNoteNumber: string;
  purchaseReturnId: string;
  returnNumber: string;
  supplierId: string;
  debitNoteDate: string;
  currency: string;
  createdAt: Date;
  lines: DebitNoteLineRecord[];
  totals: DocumentTotals;
}

function toRecord(
  note: {
    id: string;
    debit_note_number: string;
    purchase_return_id: string;
    supplier_id: string;
    debit_note_date: string | Date;
    currency: string;
    created_at: Date;
    return_number: string;
  },
  lines: readonly {
    id: string;
    purchase_return_line_id: string;
    purchase_order_line_id: string;
    product_variant_id: string;
    base_quantity: string;
    net_amount: string;
    taxes: unknown;
  }[],
): DebitNoteRecord {
  const mapped = lines.map((line) => ({
    id: line.id,
    purchaseReturnLineId: line.purchase_return_line_id,
    purchaseOrderLineId: line.purchase_order_line_id,
    productVariantId: line.product_variant_id,
    baseQuantity: Number(line.base_quantity),
    netAmount: Money.fromMinorUnits(BigInt(line.net_amount), note.currency),
    taxes: parseSnapshot(line.taxes),
  }));
  const zero = Money.fromMinorUnits(0n, note.currency);
  return {
    id: note.id,
    debitNoteNumber: note.debit_note_number,
    purchaseReturnId: note.purchase_return_id,
    returnNumber: note.return_number,
    supplierId: note.supplier_id,
    debitNoteDate: calendarDate(note.debit_note_date),
    currency: note.currency,
    createdAt: note.created_at,
    lines: mapped,
    totals:
      mapped.length > 0
        ? documentTotals(mapped)
        : { netAmount: zero, tableTaxAmount: zero, vatAmount: zero, withholdingAmount: zero, totalAmount: zero },
  };
}

/** YYYY-MM-DD of a DATE column (pg may hand it back as a local-midnight Date). */
function calendarDate(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : localIsoDate(value);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
