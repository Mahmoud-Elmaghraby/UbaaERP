import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { StockMovementsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  CreateStockMovementRow,
  StockMovementRepository,
} from '../../application/ports/stock-movement.repository';
import type { StockMovement, StockMovementType } from '../../domain/stock-movement.entity';

function toDomain(row: Selectable<StockMovementsTable>): StockMovement {
  return {
    id: row.id,
    productVariantId: row.product_variant_id,
    locationId: row.location_id,
    warehouseId: row.warehouse_id,
    movementType: row.movement_type as StockMovementType,
    quantity: Number(row.quantity),
    unitCost:
      row.unit_cost_amount === null || row.unit_cost_currency === null
        ? null
        : Money.fromMinorUnits(BigInt(row.unit_cost_amount), row.unit_cost_currency),
    resultingAverageCost: Money.fromMinorUnits(
      BigInt(row.resulting_average_cost_amount),
      row.resulting_average_cost_currency,
    ),
    totalCost:
      row.total_cost_amount === null
        ? null
        : Money.fromMinorUnits(
            BigInt(row.total_cost_amount),
            row.unit_cost_currency ?? row.resulting_average_cost_currency,
          ),
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    relatedMovementId: row.related_movement_id,
    stockLotId: row.stock_lot_id,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export class KyselyStockMovementRepository implements StockMovementRepository {
  async list(
    db: Kysely<TenantDatabase>,
    filter?: { productVariantId?: string; warehouseId?: string; locationId?: string; limit?: number },
  ): Promise<StockMovement[]> {
    let query = db.selectFrom('stock_movements').selectAll().orderBy('created_at', 'desc');
    if (filter?.productVariantId) query = query.where('product_variant_id', '=', filter.productVariantId);
    if (filter?.warehouseId) query = query.where('warehouse_id', '=', filter.warehouseId);
    if (filter?.locationId) query = query.where('location_id', '=', filter.locationId);
    if (filter?.limit) query = query.limit(filter.limit);
    const rows = await query.execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<StockMovement | null> {
    const row = await db.selectFrom('stock_movements').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateStockMovementRow): Promise<StockMovement> {
    const row = await db
      .insertInto('stock_movements')
      .values({
        id: randomUUID(),
        product_variant_id: input.productVariantId,
        location_id: input.locationId,
        warehouse_id: input.warehouseId,
        movement_type: input.movementType,
        quantity: input.quantity.toString(),
        unit_cost_amount: input.unitCost ? input.unitCost.toMinorUnits().toString() : null,
        unit_cost_currency: input.unitCost ? input.unitCost.currency : null,
        resulting_average_cost_amount: input.resultingAverageCost.toMinorUnits().toString(),
        resulting_average_cost_currency: input.resultingAverageCost.currency,
        total_cost_amount: input.totalCost ? input.totalCost.toMinorUnits().toString() : null,
        reference_type: input.referenceType ?? null,
        reference_id: input.referenceId ?? null,
        related_movement_id: input.relatedMovementId ?? null,
        stock_lot_id: input.stockLotId ?? null,
        notes: input.notes ?? null,
        created_by: input.createdBy ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async sumForReference(
    db: Kysely<TenantDatabase>,
    referenceType: string,
    referenceId: string,
    productVariantId: string,
  ): Promise<{ quantity: number; totalCostMinorUnits: bigint; currency: string } | null> {
    const row = await db
      .selectFrom('stock_movements')
      .select([
        sql<string>`SUM(quantity)`.as('quantity'),
        sql<string>`SUM(COALESCE(total_cost_amount, ROUND(quantity * COALESCE(unit_cost_amount, resulting_average_cost_amount))))`.as(
          'total',
        ),
        sql<string>`MIN(resulting_average_cost_currency)`.as('currency'),
      ])
      .where('reference_type', '=', referenceType)
      .where('reference_id', '=', referenceId)
      .where('product_variant_id', '=', productVariantId)
      .executeTakeFirst();
    if (!row || row.quantity === null || Number(row.quantity) <= 0) return null;
    return {
      quantity: Number(row.quantity),
      totalCostMinorUnits: BigInt(String(row.total).split('.')[0]!),
      currency: row.currency,
    };
  }

  async existsForReference(db: Kysely<TenantDatabase>, referenceType: string, referenceId: string): Promise<boolean> {
    const row = await db
      .selectFrom('stock_movements')
      .select('id')
      .where('reference_type', '=', referenceType)
      .where('reference_id', '=', referenceId)
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }

  async linkRelatedMovement(db: Kysely<TenantDatabase>, id: string, relatedMovementId: string): Promise<void> {
    await db
      .updateTable('stock_movements')
      .set({ related_movement_id: relatedMovementId })
      .where('id', '=', id)
      .execute();
  }
}
