import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { SalesInvoiceLinesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  SalesInvoiceLineRepository,
  CreateSalesInvoiceLineRow,
} from '../../application/ports/sales-invoice-line.repository';
import type { SalesInvoiceLine } from '../../domain/sales-invoice.entity';

function toDomain(row: Selectable<SalesInvoiceLinesTable>): SalesInvoiceLine {
  return {
    id: row.id,
    salesInvoiceId: row.sales_invoice_id,
    salesOrderLineId: row.sales_order_line_id,
    productVariantId: row.product_variant_id,
    quantityInvoiced: Number(row.quantity_invoiced),
    unitPrice: Money.fromMinorUnits(BigInt(row.unit_price_amount), row.unit_price_currency),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class KyselySalesInvoiceLineRepository implements SalesInvoiceLineRepository {
  async listBySalesInvoiceId(
    db: Kysely<TenantDatabase>,
    salesInvoiceId: string,
  ): Promise<SalesInvoiceLine[]> {
    const rows = await db
      .selectFrom('sales_invoice_lines')
      .selectAll()
      .where('sales_invoice_id', '=', salesInvoiceId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(
    db: Kysely<TenantDatabase>,
    salesInvoiceId: string,
    input: CreateSalesInvoiceLineRow,
  ): Promise<SalesInvoiceLine> {
    const row = await db
      .insertInto('sales_invoice_lines')
      .values({
        id: randomUUID(),
        sales_invoice_id: salesInvoiceId,
        sales_order_line_id: input.salesOrderLineId,
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

  async sumInvoicedQuantityBySalesOrderLineIds(
    db: Kysely<TenantDatabase>,
    salesOrderLineIds: string[],
  ): Promise<Record<string, number>> {
    if (salesOrderLineIds.length === 0) return {};

    const rows = await db
      .selectFrom('sales_invoice_lines')
      .innerJoin('sales_invoices', 'sales_invoices.id', 'sales_invoice_lines.sales_invoice_id')
      .select((eb) => [
        'sales_invoice_lines.sales_order_line_id as sales_order_line_id',
        eb.fn.sum<string>('sales_invoice_lines.quantity_invoiced').as('total'),
      ])
      .where('sales_invoices.status', '=', 'posted')
      .where('sales_invoice_lines.sales_order_line_id', 'in', salesOrderLineIds)
      .groupBy('sales_invoice_lines.sales_order_line_id')
      .execute();

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.sales_order_line_id] = Number(row.total);
    }
    return result;
  }
}
