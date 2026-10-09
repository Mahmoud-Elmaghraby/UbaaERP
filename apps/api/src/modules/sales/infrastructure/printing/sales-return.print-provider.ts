import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PrintDocumentBody, PrintProvider } from '../../../../shared/printing/print-provider';
import { documentTotalsDto, lineTaxesDto, readPrintLabels, readWarehouseName, statusLabel } from '../../../../shared/printing/print-helpers';
import { documentTotals, parseSnapshot } from '../../../../shared/taxes/line-tax-snapshot';
import { localIsoDate } from '../../../../shared/time/local-date';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../../application/ports/customer.repository';
import { customerParty } from './sales-print-shared';

/**
 * مرتجع مبيعات — what the customer brought back; once confirmed, the
 * credit note's amounts, taxes and total are on the same paper.
 */
@Injectable()
export class SalesReturnPrintProvider implements PrintProvider {
  readonly documentType = 'sales_return';
  readonly label = 'مرتجع مبيعات';
  readonly paperSizes = ['a4'] as PrintProvider['paperSizes'];
  readonly permissions = ['sales.manage'];

  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const ret = await db
      .selectFrom('sales_returns as sr')
      .innerJoin('deliveries as d', 'd.id', 'sr.delivery_id')
      .innerJoin('sales_orders as so', 'so.id', 'd.sales_order_id')
      .select(['sr.id', 'sr.return_number', 'sr.status', 'sr.return_date', 'sr.notes', 'sr.created_at', 'd.delivery_number', 'd.warehouse_id', 'so.so_number', 'so.customer_id'])
      .where('sr.id', '=', id)
      .executeTakeFirst();
    if (!ret) throw entityNotFound('SALES_RETURN', id);
    const [lines, note, customer, warehouseName] = await Promise.all([
      db.selectFrom('sales_return_lines').selectAll().where('sales_return_id', '=', id).orderBy('created_at').execute(),
      db.selectFrom('sales_credit_notes').selectAll().where('sales_return_id', '=', id).executeTakeFirst(),
      this.customers.findById(db, ret.customer_id),
      readWarehouseName(db, ret.warehouse_id),
    ]);
    const noteLines = note ? await db.selectFrom('sales_credit_note_lines').selectAll().where('sales_credit_note_id', '=', note.id).execute() : [];
    const currency = note?.currency ?? customer?.defaultCurrency ?? 'EGP';
    const lineNet = (line: (typeof noteLines)[number]) =>
      line.net_amount !== null
        ? Money.fromMinorUnits(BigInt(line.net_amount), currency)
        : Money.fromMinorUnits(BigInt(line.unit_price_amount), currency).multiplyByQuantity(Number(line.quantity));
    const byReturnLine = new Map(noteLines.map((line) => [line.sales_return_line_id, line]));
    const labels = await readPrintLabels(db, lines.map((l) => l.product_variant_id), lines.map((l) => l.unit_of_measure_id));
    const priced = noteLines.map((line) => ({ netAmount: lineNet(line), taxes: parseSnapshot(line.taxes) }));
    return {
      id: ret.id,
      title: 'مرتجع مبيعات',
      number: ret.return_number,
      status: ret.status,
      statusLabel: statusLabel(ret.status),
      date: ret.return_date ?? localIsoDate(ret.created_at),
      currency,
      party: customer ? customerParty(customer) : null,
      fields: [
        ...(note ? [{ label: 'الإشعار الدائن', value: note.credit_note_number }] : []),
        { label: 'إذن التسليم', value: ret.delivery_number },
        { label: 'أمر البيع', value: ret.so_number },
        ...(warehouseName ? [{ label: 'المخزن', value: warehouseName }] : []),
      ],
      lines: lines.map((line) => {
        const label = labels.variant(line.product_variant_id);
        const credited = byReturnLine.get(line.id);
        return {
          description: label.name,
          sku: label.sku,
          details: line.reason,
          quantity: Number(line.quantity_returned),
          unit: labels.unit(line.unit_of_measure_id, line.product_variant_id),
          amount: credited ? { amountMinorUnits: lineNet(credited).toMinorUnits().toString(), currency } : null,
          taxes: credited ? lineTaxesDto(parseSnapshot(credited.taxes), currency) : [],
        };
      }),
      totals: priced.length > 0 ? documentTotalsDto(documentTotals(priced)) : null,
      notes: ret.notes,
    };
  }
}
