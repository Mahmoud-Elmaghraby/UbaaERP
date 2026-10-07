import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { DeliveryLinesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  DeliveryLineRepository,
  CreateDeliveryLineRow,
} from '../../application/ports/delivery-line.repository';
import type { DeliveryLine, DeliveryLot } from '../../domain/delivery.entity';

function toDomain(row: Selectable<DeliveryLinesTable>): DeliveryLine {
  return {
    id: row.id,
    deliveryId: row.delivery_id,
    salesOrderLineId: row.sales_order_line_id,
    productVariantId: row.product_variant_id,
    quantityDelivered: Number(row.quantity_delivered),
    notes: row.notes,
    lots: (Array.isArray(row.lot_allocations) ? row.lot_allocations : []) as DeliveryLot[],
    unitOfMeasureId: row.unit_of_measure_id,
    unitFactor: Number(row.unit_factor),
    createdAt: row.created_at,
  };
}

export class KyselyDeliveryLineRepository implements DeliveryLineRepository {
  async listByDeliveryId(db: Kysely<TenantDatabase>, deliveryId: string): Promise<DeliveryLine[]> {
    const rows = await db
      .selectFrom('delivery_lines')
      .selectAll()
      .where('delivery_id', '=', deliveryId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(
    db: Kysely<TenantDatabase>,
    deliveryId: string,
    input: CreateDeliveryLineRow,
  ): Promise<DeliveryLine> {
    const row = await db
      .insertInto('delivery_lines')
      .values({
        id: randomUUID(),
        unit_of_measure_id: input.unitOfMeasureId ?? null,
        unit_factor: String(input.unitFactor ?? 1),
        delivery_id: deliveryId,
        sales_order_line_id: input.salesOrderLineId,
        product_variant_id: input.productVariantId,
        quantity_delivered: String(input.quantityDelivered),
        notes: input.notes ?? null,
        lot_allocations: JSON.stringify(input.lots),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async sumDeliveredQuantityBySalesOrderLineIds(
    db: Kysely<TenantDatabase>,
    salesOrderLineIds: string[],
  ): Promise<Record<string, number>> {
    if (salesOrderLineIds.length === 0) return {};

    const rows = await db
      .selectFrom('delivery_lines')
      .innerJoin('deliveries', 'deliveries.id', 'delivery_lines.delivery_id')
      .select((eb) => [
        'delivery_lines.sales_order_line_id as sales_order_line_id',
        eb.fn.sum<string>('delivery_lines.quantity_delivered').as('total'),
      ])
      .where('deliveries.status', '=', 'confirmed')
      .where('delivery_lines.sales_order_line_id', 'in', salesOrderLineIds)
      .groupBy('delivery_lines.sales_order_line_id')
      .execute();

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.sales_order_line_id] = Number(row.total);
    }
    return result;
  }
}
