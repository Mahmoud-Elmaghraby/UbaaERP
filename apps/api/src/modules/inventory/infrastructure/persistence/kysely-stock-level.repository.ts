import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { StockLevelsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { StockLevelRepository } from '../../application/ports/stock-level.repository';
import type { StockLevel } from '../../domain/stock-level.entity';

function toDomain(row: Selectable<StockLevelsTable>): StockLevel {
  return {
    id: row.id,
    productVariantId: row.product_variant_id,
    locationId: row.location_id,
    warehouseId: row.warehouse_id,
    quantityOnHand: Number(row.quantity_on_hand),
    reorderPoint: row.reorder_point === null ? null : Number(row.reorder_point),
    averageCost: Money.fromMinorUnits(BigInt(row.average_cost_amount), row.average_cost_currency),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyStockLevelRepository implements StockLevelRepository {
  async list(
    db: Kysely<TenantDatabase>,
    filter?: { warehouseId?: string; locationId?: string; productVariantId?: string },
  ): Promise<StockLevel[]> {
    let query = db.selectFrom('stock_levels').selectAll();
    if (filter?.warehouseId) query = query.where('warehouse_id', '=', filter.warehouseId);
    if (filter?.locationId) query = query.where('location_id', '=', filter.locationId);
    if (filter?.productVariantId) query = query.where('product_variant_id', '=', filter.productVariantId);
    const rows = await query.execute();
    return rows.map(toDomain);
  }

  async findByVariantAndLocation(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    locationId: string,
  ): Promise<StockLevel | null> {
    const row = await db
      .selectFrom('stock_levels')
      .selectAll()
      .where('product_variant_id', '=', productVariantId)
      .where('location_id', '=', locationId)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async upsert(
    db: Kysely<TenantDatabase>,
    input: {
      productVariantId: string;
      locationId: string;
      warehouseId: string;
      quantityOnHand: number;
      averageCost: Money;
    },
  ): Promise<StockLevel> {
    const row = await db
      .insertInto('stock_levels')
      .values({
        id: randomUUID(),
        product_variant_id: input.productVariantId,
        location_id: input.locationId,
        warehouse_id: input.warehouseId,
        quantity_on_hand: input.quantityOnHand.toString(),
        average_cost_amount: input.averageCost.toMinorUnits().toString(),
        average_cost_currency: input.averageCost.currency,
      })
      .onConflict((oc) =>
        oc.columns(['product_variant_id', 'location_id']).doUpdateSet({
          quantity_on_hand: input.quantityOnHand.toString(),
          average_cost_amount: input.averageCost.toMinorUnits().toString(),
          average_cost_currency: input.averageCost.currency,
          updated_at: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async setReorderPoint(
    db: Kysely<TenantDatabase>,
    id: string,
    reorderPoint: number | null,
  ): Promise<StockLevel | null> {
    const row = await db
      .updateTable('stock_levels')
      .set({ reorder_point: reorderPoint === null ? null : reorderPoint.toString(), updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
