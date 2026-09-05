import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { PurchaseInvoiceLinesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  PurchaseInvoiceLineRepository,
  CreatePurchaseInvoiceLineRow,
} from '../../application/ports/purchase-invoice-line.repository';
import type { PurchaseInvoiceLine } from '../../domain/purchase-invoice.entity';

function toDomain(row: Selectable<PurchaseInvoiceLinesTable>): PurchaseInvoiceLine {
  return {
    id: row.id,
    purchaseInvoiceId: row.purchase_invoice_id,
    purchaseOrderLineId: row.purchase_order_line_id,
    productVariantId: row.product_variant_id,
    quantityInvoiced: Number(row.quantity_invoiced),
    unitPrice: Money.fromMinorUnits(BigInt(row.unit_price_amount), row.unit_price_currency),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class KyselyPurchaseInvoiceLineRepository implements PurchaseInvoiceLineRepository {
  async listByPurchaseInvoiceId(
    db: Kysely<TenantDatabase>,
    purchaseInvoiceId: string,
  ): Promise<PurchaseInvoiceLine[]> {
    const rows = await db
      .selectFrom('purchase_invoice_lines')
      .selectAll()
      .where('purchase_invoice_id', '=', purchaseInvoiceId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(
    db: Kysely<TenantDatabase>,
    purchaseInvoiceId: string,
    input: CreatePurchaseInvoiceLineRow,
  ): Promise<PurchaseInvoiceLine> {
    const row = await db
      .insertInto('purchase_invoice_lines')
      .values({
        id: randomUUID(),
        purchase_invoice_id: purchaseInvoiceId,
        purchase_order_line_id: input.purchaseOrderLineId,
        product_variant_id: input.productVariantId,
        quantity_invoiced: String(input.quantityInvoiced),
        unit_price_amount: input.unitPrice.toMinorUnits().toString(),
        unit_price_currency: input.unitPrice.currency,
        notes: input.notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async sumInvoicedQuantityByPurchaseOrderLineIds(
    db: Kysely<TenantDatabase>,
    purchaseOrderLineIds: string[],
  ): Promise<Record<string, number>> {
    if (purchaseOrderLineIds.length === 0) return {};

    const rows = await db
      .selectFrom('purchase_invoice_lines')
      .innerJoin('purchase_invoices', 'purchase_invoices.id', 'purchase_invoice_lines.purchase_invoice_id')
      .select((eb) => [
        'purchase_invoice_lines.purchase_order_line_id as purchase_order_line_id',
        eb.fn.sum<string>('purchase_invoice_lines.quantity_invoiced').as('total'),
      ])
      .where('purchase_invoices.status', '=', 'posted')
      .where('purchase_invoice_lines.purchase_order_line_id', 'in', purchaseOrderLineIds)
      .groupBy('purchase_invoice_lines.purchase_order_line_id')
      .execute();

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.purchase_order_line_id] = Number(row.total);
    }
    return result;
  }
}
