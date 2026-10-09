import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PrintDocumentBody, PrintProvider } from '../../../../shared/printing/print-provider';
import { documentTotalsDto, lineTaxesDto, readPrintLabels, readWarehouseName, statusLabel } from '../../../../shared/printing/print-helpers';
import { documentTotals, parseSnapshot } from '../../../../shared/taxes/line-tax-snapshot';
import { localIsoDate } from '../../../../shared/time/local-date';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { SUPPLIER_REPOSITORY, type SupplierRepository } from '../../application/ports/supplier.repository';
import { supplierParty } from './purchases-print-shared';

const moneyDto = (minor: bigint, currency: string) => ({ amountMinorUnits: minor.toString(), currency });

/**
 * مرتجع مشتريات — what goes back to the supplier. Once confirmed, the
 * debit note issued with it (invoiced part only) adds its amounts, taxes
 * and total, so the same paper is what the supplier owes back.
 */
@Injectable()
export class PurchaseReturnPrintProvider implements PrintProvider {
  readonly documentType = 'purchase_return';
  readonly label = 'مرتجع مشتريات / إشعار خصم';
  readonly paperSizes = ['a4'] as PrintProvider['paperSizes'];
  readonly permissions = ['purchases.manage'];

  constructor(@Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepository) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const ret = await db
      .selectFrom('purchase_returns as pr')
      .innerJoin('goods_receipts as gr', 'gr.id', 'pr.goods_receipt_id')
      .innerJoin('purchase_orders as po', 'po.id', 'gr.purchase_order_id')
      .select(['pr.id', 'pr.return_number', 'pr.status', 'pr.return_date', 'pr.notes', 'pr.created_at', 'gr.receipt_number', 'gr.warehouse_id', 'po.po_number', 'po.supplier_id'])
      .where('pr.id', '=', id)
      .executeTakeFirst();
    if (!ret) throw entityNotFound('PURCHASE_RETURN', id);
    const [lines, note, supplier, warehouseName] = await Promise.all([
      db.selectFrom('purchase_return_lines').selectAll().where('purchase_return_id', '=', id).orderBy('created_at').execute(),
      db.selectFrom('purchase_debit_notes').selectAll().where('purchase_return_id', '=', id).executeTakeFirst(),
      this.suppliers.findById(db, ret.supplier_id),
      readWarehouseName(db, ret.warehouse_id),
    ]);
    const noteLines = note
      ? await db.selectFrom('purchase_debit_note_lines').selectAll().where('purchase_debit_note_id', '=', note.id).execute()
      : [];
    const byReturnLine = new Map(noteLines.map((line) => [line.purchase_return_line_id, line]));
    const currency = note?.currency ?? supplier?.defaultCurrency ?? 'EGP';
    const labels = await readPrintLabels(
      db,
      lines.map((line) => line.product_variant_id),
      lines.map((line) => line.unit_of_measure_id),
    );
    const priced = noteLines.map((line) => ({ netAmount: Money.fromMinorUnits(BigInt(line.net_amount), currency), taxes: parseSnapshot(line.taxes) }));

    return {
      id: ret.id,
      title: note ? 'مرتجع مشتريات — إشعار خصم' : 'مرتجع مشتريات',
      number: ret.return_number,
      status: ret.status,
      statusLabel: statusLabel(ret.status),
      date: ret.return_date ?? localIsoDate(ret.created_at),
      currency,
      party: supplier ? supplierParty(supplier) : null,
      fields: [
        ...(note ? [{ label: 'إشعار الخصم', value: note.debit_note_number }] : []),
        { label: 'إذن الاستلام', value: ret.receipt_number },
        { label: 'أمر الشراء', value: ret.po_number },
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
          amount: credited ? moneyDto(BigInt(credited.net_amount), currency) : null,
          taxes: credited ? lineTaxesDto(parseSnapshot(credited.taxes), currency) : [],
        };
      }),
      totals: priced.length > 0 ? documentTotalsDto(documentTotals(priced)) : null,
      notes: ret.notes,
    };
  }
}
