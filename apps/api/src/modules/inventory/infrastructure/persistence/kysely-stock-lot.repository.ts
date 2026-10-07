import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type {
  StockLotsTable,
  StockLotLevelsTable,
  StockLotConsumptionsTable,
  TenantDatabase,
} from '../../../../database/tenant/kysely-client';
import type {
  StockLotRepository,
  AvailableLotLevel,
  ExpiringLotRow,
  LotQuantityMoved,
} from '../../application/ports/stock-lot.repository';
import type {
  StockLot,
  CreateStockLotInput,
  StockLotLevel,
  StockLotWithLevels,
  StockLotConsumption,
} from '../../domain/stock-lot.entity';

/** DATE text ('YYYY-MM-DD', see TENANT_PG_TYPES) → Date at local midnight, as the domain uses. */
function fromDateOnly(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00`) : null;
}

/** Date → 'YYYY-MM-DD' from its LOCAL parts (no UTC shift around midnight). */
function toDateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function lotToDomain(row: Selectable<StockLotsTable>): StockLot {
  return {
    id: row.id,
    productVariantId: row.product_variant_id,
    lotNumber: row.lot_number,
    expiryDate: fromDateOnly(row.expiry_date),
    unitCost: Money.fromMinorUnits(BigInt(row.unit_cost_amount), row.unit_cost_currency),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function levelToDomain(row: Selectable<StockLotLevelsTable>): StockLotLevel {
  return {
    id: row.id,
    stockLotId: row.stock_lot_id,
    locationId: row.location_id,
    warehouseId: row.warehouse_id,
    quantityOnHand: Number(row.quantity_on_hand),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function consumptionToDomain(row: Selectable<StockLotConsumptionsTable>): StockLotConsumption {
  return {
    id: row.id,
    stockMovementId: row.stock_movement_id,
    stockLotId: row.stock_lot_id,
    quantity: Number(row.quantity),
    createdAt: row.created_at,
  };
}

export class KyselyStockLotRepository implements StockLotRepository {
  async findByVariantAndLotNumber(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    lotNumber: string,
  ): Promise<StockLot | null> {
    const row = await db
      .selectFrom('stock_lots')
      .selectAll()
      .where('product_variant_id', '=', productVariantId)
      .where('lot_number', '=', lotNumber)
      .executeTakeFirst();
    return row ? lotToDomain(row) : null;
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<StockLot | null> {
    const row = await db.selectFrom('stock_lots').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? lotToDomain(row) : null;
  }

  async listByVariantId(db: Kysely<TenantDatabase>, productVariantId: string): Promise<StockLotWithLevels[]> {
    const lots = await db
      .selectFrom('stock_lots')
      .selectAll()
      .where('product_variant_id', '=', productVariantId)
      .orderBy('expiry_date', 'asc')
      .orderBy('created_at', 'asc')
      .execute();
    if (lots.length === 0) return [];

    const levelRows = await db
      .selectFrom('stock_lot_levels')
      .selectAll()
      .where(
        'stock_lot_id',
        'in',
        lots.map((l) => l.id),
      )
      .execute();
    const levelsByLotId = new Map<string, StockLotLevel[]>();
    for (const row of levelRows) {
      const level = levelToDomain(row);
      const list = levelsByLotId.get(level.stockLotId) ?? [];
      list.push(level);
      levelsByLotId.set(level.stockLotId, list);
    }

    return lots.map((row) => ({ ...lotToDomain(row), levels: levelsByLotId.get(row.id) ?? [] }));
  }

  async createLot(db: Kysely<TenantDatabase>, input: CreateStockLotInput): Promise<StockLot> {
    const row = await db
      .insertInto('stock_lots')
      .values({
        id: randomUUID(),
        product_variant_id: input.productVariantId,
        lot_number: input.lotNumber,
        expiry_date: toDateOnly(input.expiryDate),
        unit_cost_amount: input.unitCost.toMinorUnits().toString(),
        unit_cost_currency: input.unitCost.currency,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return lotToDomain(row);
  }

  async totalQuantityOnHand(db: Kysely<TenantDatabase>, stockLotId: string): Promise<number> {
    const row = await db
      .selectFrom('stock_lot_levels')
      .select(sql<string>`coalesce(sum(quantity_on_hand), 0)`.as('total'))
      .where('stock_lot_id', '=', stockLotId)
      .executeTakeFirst();
    return Number(row?.total ?? 0);
  }

  async findLevel(db: Kysely<TenantDatabase>, stockLotId: string, locationId: string): Promise<StockLotLevel | null> {
    const row = await db
      .selectFrom('stock_lot_levels')
      .selectAll()
      .where('stock_lot_id', '=', stockLotId)
      .where('location_id', '=', locationId)
      .executeTakeFirst();
    return row ? levelToDomain(row) : null;
  }

  async upsertLevel(
    db: Kysely<TenantDatabase>,
    input: { stockLotId: string; locationId: string; warehouseId: string; quantityOnHand: number },
  ): Promise<StockLotLevel> {
    const existing = await this.findLevel(db, input.stockLotId, input.locationId);
    if (existing) {
      const row = await db
        .updateTable('stock_lot_levels')
        .set({ quantity_on_hand: input.quantityOnHand.toString(), updated_at: sql`now()` })
        .where('id', '=', existing.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return levelToDomain(row);
    }

    const row = await db
      .insertInto('stock_lot_levels')
      .values({
        id: randomUUID(),
        stock_lot_id: input.stockLotId,
        location_id: input.locationId,
        warehouse_id: input.warehouseId,
        quantity_on_hand: input.quantityOnHand.toString(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return levelToDomain(row);
  }

  async listAvailableForFifo(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    locationId: string,
    options: { excludeExpired?: boolean } = {},
  ): Promise<AvailableLotLevel[]> {
    let query = db
      .selectFrom('stock_lot_levels')
      .innerJoin('stock_lots', 'stock_lots.id', 'stock_lot_levels.stock_lot_id')
      .select([
        'stock_lots.id as stock_lot_id',
        'stock_lots.lot_number as lot_number',
        'stock_lots.expiry_date as expiry_date',
        'stock_lot_levels.quantity_on_hand as quantity_on_hand',
      ])
      .where('stock_lots.product_variant_id', '=', productVariantId)
      .where('stock_lot_levels.location_id', '=', locationId)
      .where('stock_lot_levels.quantity_on_hand', '>', '0');
    if (options.excludeExpired) {
      query = query.where((eb) =>
        eb.or([eb('stock_lots.expiry_date', 'is', null), eb('stock_lots.expiry_date', '>=', sql<string>`CURRENT_DATE`)]),
      );
    }
    const rows = await query
      .orderBy('stock_lots.expiry_date', 'asc')
      .orderBy('stock_lots.created_at', 'asc')
      .execute();

    return rows.map((row) => ({
      stockLotId: row.stock_lot_id,
      lotNumber: row.lot_number,
      expiryDate: fromDateOnly(row.expiry_date),
      quantityAvailable: Number(row.quantity_on_hand),
    }));
  }

  async isExpired(db: Kysely<TenantDatabase>, stockLotId: string): Promise<boolean> {
    const row = await db
      .selectFrom('stock_lots')
      .select(sql<boolean>`expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE`.as('expired'))
      .where('id', '=', stockLotId)
      .executeTakeFirst();
    return row?.expired === true;
  }

  async lotsMovedByReference(
    db: Kysely<TenantDatabase>,
    referenceType: string,
    referenceId: string,
    productVariantId: string,
  ): Promise<LotQuantityMoved[]> {
    // A movement either names its single lot (stock_lot_id) or, when FIFO
    // spanned several lots, leaves it NULL and lists them in
    // stock_lot_consumptions — both shapes are summed per lot here.
    const result = await sql<{
      stock_lot_id: string;
      lot_number: string;
      expiry_date: string | null;
      quantity: string;
      first_moved: Date;
    }>`
      SELECT l.id AS stock_lot_id, l.lot_number, l.expiry_date, SUM(x.quantity) AS quantity, MIN(x.created_at) AS first_moved
      FROM (
        SELECT m.stock_lot_id, m.quantity, m.created_at
          FROM stock_movements m
         WHERE m.reference_type = ${referenceType} AND m.reference_id = ${referenceId}
           AND m.product_variant_id = ${productVariantId} AND m.stock_lot_id IS NOT NULL
        UNION ALL
        SELECT c.stock_lot_id, c.quantity, m.created_at
          FROM stock_lot_consumptions c
          JOIN stock_movements m ON m.id = c.stock_movement_id
         WHERE m.reference_type = ${referenceType} AND m.reference_id = ${referenceId}
           AND m.product_variant_id = ${productVariantId}
      ) x
      JOIN stock_lots l ON l.id = x.stock_lot_id
      GROUP BY l.id, l.lot_number, l.expiry_date
      ORDER BY first_moved, l.lot_number
    `.execute(db);
    return result.rows.map((row) => ({
      stockLotId: row.stock_lot_id,
      lotNumber: row.lot_number,
      expiryDate: fromDateOnly(row.expiry_date),
      quantity: Number(row.quantity),
    }));
  }

  async listExpiring(db: Kysely<TenantDatabase>, untilDate: string): Promise<ExpiringLotRow[]> {
    const rows = await db
      .selectFrom('stock_lot_levels')
      .innerJoin('stock_lots', 'stock_lots.id', 'stock_lot_levels.stock_lot_id')
      .innerJoin('product_variants', 'product_variants.id', 'stock_lots.product_variant_id')
      .innerJoin('products', 'products.id', 'product_variants.product_id')
      .innerJoin('warehouses', 'warehouses.id', 'stock_lot_levels.warehouse_id')
      .select([
        'stock_lots.id as stock_lot_id',
        'stock_lots.lot_number as lot_number',
        'stock_lots.expiry_date as expiry_date',
        'stock_lots.unit_cost_amount as unit_cost_amount',
        'stock_lots.unit_cost_currency as unit_cost_currency',
        'product_variants.id as product_variant_id',
        'product_variants.sku as sku',
        'products.name as product_name',
        'products.code as product_code',
        'warehouses.id as warehouse_id',
        'warehouses.name as warehouse_name',
        sql<string>`SUM(stock_lot_levels.quantity_on_hand)`.as('quantity_on_hand'),
      ])
      .where('stock_lots.expiry_date', 'is not', null)
      .where('stock_lots.expiry_date', '<=', sql<string>`${untilDate}::date`)
      .where('stock_lot_levels.quantity_on_hand', '>', '0')
      .groupBy([
        'stock_lots.id',
        'product_variants.id',
        'products.name',
        'products.code',
        'warehouses.id',
        'warehouses.name',
      ])
      .orderBy('stock_lots.expiry_date', 'asc')
      .orderBy('products.name', 'asc')
      .execute();
    return rows.map((row) => ({
      stockLotId: row.stock_lot_id,
      lotNumber: row.lot_number,
      expiryDate: fromDateOnly(row.expiry_date)!,
      productVariantId: row.product_variant_id,
      productName: row.product_name,
      productCode: row.product_code,
      sku: row.sku,
      warehouseId: row.warehouse_id,
      warehouseName: row.warehouse_name,
      quantityOnHand: Number(row.quantity_on_hand),
      unitCost: { amountMinorUnits: String(row.unit_cost_amount), currency: row.unit_cost_currency },
    }));
  }

  async createConsumption(
    db: Kysely<TenantDatabase>,
    input: { stockMovementId: string; stockLotId: string; quantity: number },
  ): Promise<StockLotConsumption> {
    const row = await db
      .insertInto('stock_lot_consumptions')
      .values({
        id: randomUUID(),
        stock_movement_id: input.stockMovementId,
        stock_lot_id: input.stockLotId,
        quantity: input.quantity.toString(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return consumptionToDomain(row);
  }

  async listConsumptionsByMovementId(
    db: Kysely<TenantDatabase>,
    stockMovementId: string,
  ): Promise<StockLotConsumption[]> {
    const rows = await db
      .selectFrom('stock_lot_consumptions')
      .selectAll()
      .where('stock_movement_id', '=', stockMovementId)
      .execute();
    return rows.map(consumptionToDomain);
  }
}
