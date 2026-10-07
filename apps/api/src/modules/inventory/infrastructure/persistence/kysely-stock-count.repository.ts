import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  CountableStockRow,
  StockCountLineRow,
  StockCountRepository,
} from '../../application/ports/stock-count.repository';
import type { StockCount, StockCountKind, StockCountLine, StockCountStatus } from '../../domain/stock-count.entity';

// DATE columns are read as 'YYYY-MM-DD' text so no time zone ever shifts the day.
const COUNT_COLUMNS = [
  'id',
  'count_number',
  'kind',
  'warehouse_id',
  'status',
  sql<string | null>`to_char(count_date, 'YYYY-MM-DD')`.as('count_date'),
  'notes',
  'created_by',
  'posted_by',
  'posted_at',
  'created_at',
  'updated_at',
] as const;

interface CountRow {
  id: string;
  count_number: string;
  kind: string;
  warehouse_id: string;
  status: string;
  count_date: string | null;
  notes: string | null;
  created_by: string | null;
  posted_by: string | null;
  posted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function countToDomain(row: CountRow): StockCount {
  return {
    id: row.id,
    countNumber: row.count_number,
    kind: row.kind as StockCountKind,
    warehouseId: row.warehouse_id,
    status: row.status as StockCountStatus,
    countDate: row.count_date,
    notes: row.notes,
    createdBy: row.created_by,
    postedBy: row.posted_by,
    postedAt: row.posted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface LineRow {
  id: string;
  stock_count_id: string;
  product_variant_id: string;
  location_id: string;
  lot_number: string | null;
  expiry_date: string | null;
  system_quantity: string;
  counted_quantity: string | null;
  unit_cost_amount: string | null;
  unit_cost_currency: string | null;
}

function lineToDomain(row: LineRow): StockCountLine {
  return {
    id: row.id,
    stockCountId: row.stock_count_id,
    productVariantId: row.product_variant_id,
    locationId: row.location_id,
    lotNumber: row.lot_number,
    expiryDate: row.expiry_date,
    systemQuantity: Number(row.system_quantity),
    countedQuantity: row.counted_quantity === null ? null : Number(row.counted_quantity),
    unitCost:
      row.unit_cost_amount !== null && row.unit_cost_currency !== null
        ? Money.fromMinorUnits(BigInt(row.unit_cost_amount), row.unit_cost_currency)
        : null,
  };
}

const LINE_COLUMNS = [
  'id',
  'stock_count_id',
  'product_variant_id',
  'location_id',
  'lot_number',
  sql<string | null>`to_char(expiry_date, 'YYYY-MM-DD')`.as('expiry_date'),
  'system_quantity',
  'counted_quantity',
  'unit_cost_amount',
  'unit_cost_currency',
] as const;

export class KyselyStockCountRepository implements StockCountRepository {
  async list(db: Kysely<TenantDatabase>, filter: { kind?: StockCountKind }): Promise<StockCount[]> {
    let query = db.selectFrom('stock_counts').select(COUNT_COLUMNS);
    if (filter.kind) query = query.where('kind', '=', filter.kind);
    const rows = await query.orderBy('created_at', 'desc').execute();
    return rows.map((row) => countToDomain(row as CountRow));
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<StockCount | null> {
    const row = await db.selectFrom('stock_counts').select(COUNT_COLUMNS).where('id', '=', id).executeTakeFirst();
    return row ? countToDomain(row as CountRow) : null;
  }

  async lockForUpdate(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await db.selectFrom('stock_counts').select('id').where('id', '=', id).forUpdate().execute();
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: {
      countNumber: string;
      kind: StockCountKind;
      warehouseId: string;
      countDate: string | null;
      notes: string | null;
      createdBy: string | null;
    },
  ): Promise<StockCount> {
    const id = randomUUID();
    await db
      .insertInto('stock_counts')
      .values({
        id,
        count_number: input.countNumber,
        kind: input.kind,
        warehouse_id: input.warehouseId,
        count_date: input.countDate,
        notes: input.notes,
        created_by: input.createdBy,
      })
      .execute();
    return (await this.findById(db, id))!;
  }

  async updateHeader(
    db: Kysely<TenantDatabase>,
    id: string,
    input: { countDate?: string | null; notes?: string | null },
  ): Promise<StockCount | null> {
    await db
      .updateTable('stock_counts')
      .set({
        ...(input.countDate !== undefined ? { count_date: input.countDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .execute();
    return this.findById(db, id);
  }

  async setStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: StockCountStatus,
    postedBy: string | null = null,
  ): Promise<StockCount | null> {
    await db
      .updateTable('stock_counts')
      .set({
        status,
        ...(status === 'posted' ? { posted_by: postedBy, posted_at: sql`now()` } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .execute();
    return this.findById(db, id);
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await db.deleteFrom('stock_counts').where('id', '=', id).execute();
  }

  async listLines(db: Kysely<TenantDatabase>, stockCountId: string): Promise<StockCountLine[]> {
    const rows = await db
      .selectFrom('stock_count_lines')
      .select(LINE_COLUMNS)
      .where('stock_count_id', '=', stockCountId)
      .orderBy('created_at')
      .orderBy('lot_number')
      .execute();
    return rows.map((row) => lineToDomain(row as LineRow));
  }

  async upsertLine(db: Kysely<TenantDatabase>, stockCountId: string, row: StockCountLineRow): Promise<StockCountLine> {
    // ON CONFLICT can't target the COALESCE expression index portably through
    // the builder, so look the line up first (the count is a draft edited by
    // one person; the unique index still guards against duplicates).
    let existing = db
      .selectFrom('stock_count_lines')
      .select('id')
      .where('stock_count_id', '=', stockCountId)
      .where('product_variant_id', '=', row.productVariantId)
      .where('location_id', '=', row.locationId);
    existing =
      row.lotNumber === null
        ? existing.where('lot_number', 'is', null)
        : existing.where('lot_number', '=', row.lotNumber);
    const found = await existing.executeTakeFirst();
    const cost = {
      unit_cost_amount: row.unitCost ? row.unitCost.toMinorUnits().toString() : null,
      unit_cost_currency: row.unitCost ? row.unitCost.currency : null,
    };
    let id: string;
    if (found) {
      id = found.id;
      await db
        .updateTable('stock_count_lines')
        .set({
          counted_quantity: row.countedQuantity === null ? null : String(row.countedQuantity),
          expiry_date: row.expiryDate,
          ...cost,
          updated_at: sql`now()`,
        })
        .where('id', '=', id)
        .execute();
    } else {
      id = randomUUID();
      await db
        .insertInto('stock_count_lines')
        .values({
          id,
          stock_count_id: stockCountId,
          product_variant_id: row.productVariantId,
          location_id: row.locationId,
          lot_number: row.lotNumber,
          expiry_date: row.expiryDate,
          system_quantity: String(row.systemQuantity),
          counted_quantity: row.countedQuantity === null ? null : String(row.countedQuantity),
          ...cost,
        })
        .execute();
    }
    const saved = await db
      .selectFrom('stock_count_lines')
      .select(LINE_COLUMNS)
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return lineToDomain(saved as LineRow);
  }

  async deleteLine(db: Kysely<TenantDatabase>, stockCountId: string, lineId: string): Promise<boolean> {
    const result = await db
      .deleteFrom('stock_count_lines')
      .where('id', '=', lineId)
      .where('stock_count_id', '=', stockCountId)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  async setSystemQuantity(db: Kysely<TenantDatabase>, lineId: string, quantity: number): Promise<void> {
    await db
      .updateTable('stock_count_lines')
      .set({ system_quantity: String(quantity), updated_at: sql`now()` })
      .where('id', '=', lineId)
      .execute();
  }

  async listCountableStock(
    db: Kysely<TenantDatabase>,
    warehouseId: string,
    filter: { categoryIds?: string[]; locationIds?: string[] },
  ): Promise<CountableStockRow[]> {
    const categoryIds = filter.categoryIds ?? [];
    const locationIds = filter.locationIds ?? [];
    const result = await sql<{
      product_variant_id: string;
      location_id: string;
      lot_number: string | null;
      expiry_date: string | null;
      quantity: string;
    }>`
      SELECT sl.product_variant_id, sl.location_id, NULL::text AS lot_number, NULL::text AS expiry_date,
             sl.quantity_on_hand AS quantity, p.name AS product_name
        FROM stock_levels sl
        JOIN product_variants v ON v.id = sl.product_variant_id
        JOIN products p ON p.id = v.product_id
       WHERE sl.warehouse_id = ${warehouseId}
         AND sl.quantity_on_hand > 0
         AND p.tracking_type = 'none' AND p.item_type = 'stock'
         ${categoryIds.length ? sql`AND p.category_id IN (${sql.join(categoryIds)})` : sql``}
         ${locationIds.length ? sql`AND sl.location_id IN (${sql.join(locationIds)})` : sql``}
      UNION ALL
      SELECT l.product_variant_id, ll.location_id, l.lot_number, to_char(l.expiry_date, 'YYYY-MM-DD'),
             ll.quantity_on_hand, p.name
        FROM stock_lot_levels ll
        JOIN stock_lots l ON l.id = ll.stock_lot_id
        JOIN product_variants v ON v.id = l.product_variant_id
        JOIN products p ON p.id = v.product_id
       WHERE ll.warehouse_id = ${warehouseId}
         AND ll.quantity_on_hand > 0
         AND p.tracking_type <> 'none'
         ${categoryIds.length ? sql`AND p.category_id IN (${sql.join(categoryIds)})` : sql``}
         ${locationIds.length ? sql`AND ll.location_id IN (${sql.join(locationIds)})` : sql``}
      ORDER BY product_name, product_variant_id, lot_number
    `.execute(db);
    return result.rows.map((row) => ({
      productVariantId: row.product_variant_id,
      locationId: row.location_id,
      lotNumber: row.lot_number,
      expiryDate: row.expiry_date,
      quantity: Number(row.quantity),
    }));
  }

  async currentQuantity(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    locationId: string,
    lotNumber: string | null,
  ): Promise<number> {
    if (lotNumber === null) {
      const row = await db
        .selectFrom('stock_levels')
        .select('quantity_on_hand')
        .where('product_variant_id', '=', productVariantId)
        .where('location_id', '=', locationId)
        .executeTakeFirst();
      return row ? Number(row.quantity_on_hand) : 0;
    }
    const row = await db
      .selectFrom('stock_lot_levels')
      .innerJoin('stock_lots', 'stock_lots.id', 'stock_lot_levels.stock_lot_id')
      .select('stock_lot_levels.quantity_on_hand')
      .where('stock_lots.product_variant_id', '=', productVariantId)
      .where('stock_lots.lot_number', '=', lotNumber)
      .where('stock_lot_levels.location_id', '=', locationId)
      .executeTakeFirst();
    return row ? Number(row.quantity_on_hand) : 0;
  }
}
