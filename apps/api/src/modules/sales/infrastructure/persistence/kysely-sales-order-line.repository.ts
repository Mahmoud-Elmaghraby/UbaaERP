import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { SalesOrderLinesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { SalesOrderLineRepository } from '../../application/ports/sales-order-line.repository';
import type { DiscountType, SalesOrderLine, CreateSalesOrderLineInput } from '../../domain/sales-order.entity';

function toDomain(row: Selectable<SalesOrderLinesTable>): SalesOrderLine {
  return {
    id: row.id,
    salesOrderId: row.sales_order_id,
    productVariantId: row.product_variant_id,
    quantity: Number(row.quantity),
    unitPrice: Money.fromMinorUnits(BigInt(row.unit_price_amount), row.unit_price_currency),
    discountType: row.discount_type as DiscountType | null,
    discountPercentage: row.discount_percentage === null ? null : Number(row.discount_percentage),
    discountFixedAmount:
      row.discount_fixed_amount === null
        ? null
        : Money.fromMinorUnits(BigInt(row.discount_fixed_amount), row.unit_price_currency),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class KyselySalesOrderLineRepository implements SalesOrderLineRepository {
  async listBySalesOrderId(db: Kysely<TenantDatabase>, salesOrderId: string): Promise<SalesOrderLine[]> {
    const rows = await db
      .selectFrom('sales_order_lines')
      .selectAll()
      .where('sales_order_id', '=', salesOrderId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(
    db: Kysely<TenantDatabase>,
    salesOrderId: string,
    input: CreateSalesOrderLineInput,
  ): Promise<SalesOrderLine> {
    const row = await db
      .insertInto('sales_order_lines')
      .values({
        id: randomUUID(),
        sales_order_id: salesOrderId,
        product_variant_id: input.productVariantId,
        quantity: String(input.quantity),
        unit_price_amount: input.unitPrice.toMinorUnits().toString(),
        unit_price_currency: input.unitPrice.currency,
        discount_type: input.discountType ?? null,
        discount_percentage: input.discountPercentage == null ? null : String(input.discountPercentage),
        discount_fixed_amount: input.discountFixedAmount ? input.discountFixedAmount.toMinorUnits().toString() : null,
        notes: input.notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async deleteBySalesOrderId(db: Kysely<TenantDatabase>, salesOrderId: string): Promise<void> {
    await db.deleteFrom('sales_order_lines').where('sales_order_id', '=', salesOrderId).execute();
  }
}
