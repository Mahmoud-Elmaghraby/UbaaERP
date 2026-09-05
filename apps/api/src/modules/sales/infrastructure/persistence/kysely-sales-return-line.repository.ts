import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { SalesReturnLinesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  SalesReturnLineRepository,
  CreateSalesReturnLineRow,
} from '../../application/ports/sales-return-line.repository';
import type { SalesReturnLine } from '../../domain/sales-return.entity';

function toDomain(row: Selectable<SalesReturnLinesTable>): SalesReturnLine {
  return {
    id: row.id,
    salesReturnId: row.sales_return_id,
    deliveryLineId: row.delivery_line_id,
    productVariantId: row.product_variant_id,
    quantityReturned: Number(row.quantity_returned),
    reason: row.reason,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class KyselySalesReturnLineRepository implements SalesReturnLineRepository {
  async listBySalesReturnId(db: Kysely<TenantDatabase>, salesReturnId: string): Promise<SalesReturnLine[]> {
    const rows = await db
      .selectFrom('sales_return_lines')
      .selectAll()
      .where('sales_return_id', '=', salesReturnId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(
    db: Kysely<TenantDatabase>,
    salesReturnId: string,
    input: CreateSalesReturnLineRow,
  ): Promise<SalesReturnLine> {
    const row = await db
      .insertInto('sales_return_lines')
      .values({
        id: randomUUID(),
        sales_return_id: salesReturnId,
        delivery_line_id: input.deliveryLineId,
        product_variant_id: input.productVariantId,
        quantity_returned: String(input.quantityReturned),
        reason: input.reason,
        notes: input.notes,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async sumReturnedQuantityByDeliveryLineIds(
    db: Kysely<TenantDatabase>,
    deliveryLineIds: string[],
  ): Promise<Record<string, number>> {
    if (deliveryLineIds.length === 0) return {};

    const rows = await db
      .selectFrom('sales_return_lines')
      .innerJoin('sales_returns', 'sales_returns.id', 'sales_return_lines.sales_return_id')
      .select((eb) => [
        'sales_return_lines.delivery_line_id as delivery_line_id',
        eb.fn.sum<string>('sales_return_lines.quantity_returned').as('total'),
      ])
      .where('sales_returns.status', '=', 'confirmed')
      .where('sales_return_lines.delivery_line_id', 'in', deliveryLineIds)
      .groupBy('sales_return_lines.delivery_line_id')
      .execute();

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.delivery_line_id] = Number(row.total);
    }
    return result;
  }
}
