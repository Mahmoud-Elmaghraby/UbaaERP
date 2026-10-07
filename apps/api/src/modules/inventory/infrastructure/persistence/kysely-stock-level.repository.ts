import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Selectable } from 'kysely';
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
    inventoryValue: Money.fromMinorUnits(BigInt(row.inventory_value_amount), row.average_cost_currency),
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
      inventoryValue: Money;
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
        inventory_value_amount: input.inventoryValue.toMinorUnits().toString(),
      })
      .onConflict((oc) =>
        oc.columns(['product_variant_id', 'location_id']).doUpdateSet({
          quantity_on_hand: input.quantityOnHand.toString(),
          average_cost_amount: input.averageCost.toMinorUnits().toString(),
          average_cost_currency: input.averageCost.currency,
          inventory_value_amount: input.inventoryValue.toMinorUnits().toString(),
          updated_at: sql`now()`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  /**
   * Transaction-scoped advisory locks (pg_advisory_xact_lock), one per
   * variant. An advisory lock rather than SELECT … FOR UPDATE because the
   * stock_levels / stock_lot_levels rows may not exist yet (first receipt
   * at a location) and because one variant's lot rows span several
   * tables — the lock covers all of them with one key. Keys are hashed
   * UUIDs, so collisions between tenants sharing the cluster are
   * negligible and would only cost a brief extra wait, never correctness.
   */
  async lockVariants(db: Kysely<TenantDatabase>, productVariantIds: readonly string[]): Promise<void> {
    if (!db.isTransaction) {
      throw new Error('KyselyStockLevelRepository.lockVariants() must be called inside a transaction.');
    }
    const ordered = [...new Set(productVariantIds)].sort();
    for (const id of ordered) {
      await sql`select pg_advisory_xact_lock(hashtextextended(${`stock:${id}`}, 0))`.execute(db);
    }
  }

  async setReorderPoint(
    db: Kysely<TenantDatabase>,
    id: string,
    reorderPoint: number | null,
  ): Promise<StockLevel | null> {
    const row = await db
      .updateTable('stock_levels')
      .set({ reorder_point: reorderPoint === null ? null : reorderPoint.toString(), updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
