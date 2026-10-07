import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  StockAdjustmentLineRow,
  StockAdjustmentRepository,
} from '../../application/ports/stock-adjustment.repository';
import type {
  AdjustmentDirection,
  ReasonDirection,
  StockAdjustment,
  StockAdjustmentLine,
  StockAdjustmentReason,
  StockAdjustmentReasonInput,
  StockAdjustmentStatus,
} from '../../domain/stock-adjustment.entity';

interface ReasonRow {
  id: string;
  name: string;
  direction: string;
  account_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

function reasonToDomain(row: ReasonRow): StockAdjustmentReason {
  return {
    id: row.id,
    name: row.name,
    direction: row.direction as ReasonDirection,
    accountId: row.account_id,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const HEADER_COLUMNS = [
  'id',
  'adjustment_number',
  'status',
  'warehouse_id',
  'location_id',
  'reason_id',
  sql<string>`to_char(adjustment_date, 'YYYY-MM-DD')`.as('adjustment_date'),
  'notes',
  'created_by',
  'posted_by',
  'posted_at',
  'created_at',
  'updated_at',
] as const;

interface HeaderRow {
  id: string;
  adjustment_number: string;
  status: string;
  warehouse_id: string;
  location_id: string;
  reason_id: string | null;
  adjustment_date: string;
  notes: string | null;
  created_by: string | null;
  posted_by: string | null;
  posted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function headerToDomain(row: HeaderRow): StockAdjustment {
  return {
    id: row.id,
    adjustmentNumber: row.adjustment_number,
    status: row.status as StockAdjustmentStatus,
    warehouseId: row.warehouse_id,
    locationId: row.location_id,
    reasonId: row.reason_id,
    adjustmentDate: row.adjustment_date,
    notes: row.notes,
    createdBy: row.created_by,
    postedBy: row.posted_by,
    postedAt: row.posted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function money(amount: string | null, currency: string | null): Money | null {
  return amount !== null && currency !== null ? Money.fromMinorUnits(BigInt(amount), currency) : null;
}

export class KyselyStockAdjustmentRepository implements StockAdjustmentRepository {
  async listReasons(db: Kysely<TenantDatabase>): Promise<StockAdjustmentReason[]> {
    const rows = await db.selectFrom('stock_adjustment_reasons').selectAll().orderBy('sort_order').orderBy('name').execute();
    return rows.map(reasonToDomain);
  }

  async findReason(db: Kysely<TenantDatabase>, id: string): Promise<StockAdjustmentReason | null> {
    const row = await db.selectFrom('stock_adjustment_reasons').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? reasonToDomain(row) : null;
  }

  async createReason(db: Kysely<TenantDatabase>, input: StockAdjustmentReasonInput): Promise<StockAdjustmentReason> {
    const row = await db
      .insertInto('stock_adjustment_reasons')
      .values({
        id: randomUUID(),
        name: input.name,
        direction: input.direction ?? 'both',
        account_id: input.accountId ?? null,
        is_active: input.isActive ?? true,
        sort_order: input.sortOrder ?? 100,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return reasonToDomain(row);
  }

  async updateReason(
    db: Kysely<TenantDatabase>,
    id: string,
    input: Partial<StockAdjustmentReasonInput>,
  ): Promise<StockAdjustmentReason | null> {
    const row = await db
      .updateTable('stock_adjustment_reasons')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.direction !== undefined ? { direction: input.direction } : {}),
        ...(input.accountId !== undefined ? { account_id: input.accountId } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
        updated_at: sql<Date>`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? reasonToDomain(row) : null;
  }

  async deleteReason(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('stock_adjustment_reasons').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  async reasonInUse(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const header = await db.selectFrom('stock_adjustments').select('id').where('reason_id', '=', id).limit(1).executeTakeFirst();
    if (header) return true;
    const line = await db
      .selectFrom('stock_adjustment_lines')
      .select('id')
      .where('reason_id', '=', id)
      .limit(1)
      .executeTakeFirst();
    return Boolean(line);
  }

  async list(
    db: Kysely<TenantDatabase>,
    filter: { status?: StockAdjustmentStatus; warehouseId?: string },
  ): Promise<StockAdjustment[]> {
    let query = db.selectFrom('stock_adjustments').select(HEADER_COLUMNS);
    if (filter.status) query = query.where('status', '=', filter.status);
    if (filter.warehouseId) query = query.where('warehouse_id', '=', filter.warehouseId);
    const rows = await query.orderBy('created_at', 'desc').limit(1000).execute();
    return rows.map((row) => headerToDomain(row as HeaderRow));
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<StockAdjustment | null> {
    const row = await db.selectFrom('stock_adjustments').select(HEADER_COLUMNS).where('id', '=', id).executeTakeFirst();
    return row ? headerToDomain(row as HeaderRow) : null;
  }

  async lockForUpdate(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await db.selectFrom('stock_adjustments').select('id').where('id', '=', id).forUpdate().execute();
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: Parameters<StockAdjustmentRepository['create']>[1],
  ): Promise<StockAdjustment> {
    const id = randomUUID();
    await db
      .insertInto('stock_adjustments')
      .values({
        id,
        adjustment_number: input.adjustmentNumber,
        warehouse_id: input.warehouseId,
        location_id: input.locationId,
        reason_id: input.reasonId,
        ...(input.adjustmentDate ? { adjustment_date: input.adjustmentDate } : {}),
        notes: input.notes,
        created_by: input.createdBy,
      })
      .execute();
    return (await this.findById(db, id))!;
  }

  async updateHeader(
    db: Kysely<TenantDatabase>,
    id: string,
    input: Parameters<StockAdjustmentRepository['updateHeader']>[2],
  ): Promise<void> {
    await db
      .updateTable('stock_adjustments')
      .set({
        ...(input.warehouseId !== undefined ? { warehouse_id: input.warehouseId } : {}),
        ...(input.locationId !== undefined ? { location_id: input.locationId } : {}),
        ...(input.reasonId !== undefined ? { reason_id: input.reasonId } : {}),
        ...(input.adjustmentDate !== undefined ? { adjustment_date: input.adjustmentDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updated_at: sql<Date>`now()`,
      })
      .where('id', '=', id)
      .execute();
  }

  async setStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: StockAdjustmentStatus,
    postedBy?: string | null,
  ): Promise<void> {
    await db
      .updateTable('stock_adjustments')
      .set({
        status,
        ...(status === 'posted' ? { posted_by: postedBy ?? null, posted_at: sql<Date>`now()` } : {}),
        updated_at: sql<Date>`now()`,
      })
      .where('id', '=', id)
      .execute();
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await db.deleteFrom('stock_adjustments').where('id', '=', id).execute();
  }

  async listLines(db: Kysely<TenantDatabase>, adjustmentId: string): Promise<StockAdjustmentLine[]> {
    const rows = await db
      .selectFrom('stock_adjustment_lines')
      .selectAll()
      .select(sql<string | null>`to_char(expiry_date, 'YYYY-MM-DD')`.as('expiry_text'))
      .where('stock_adjustment_id', '=', adjustmentId)
      .orderBy('line_number')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      stockAdjustmentId: row.stock_adjustment_id,
      lineNumber: row.line_number,
      productVariantId: row.product_variant_id,
      direction: row.direction as AdjustmentDirection,
      quantity: Number(row.quantity),
      unitOfMeasureId: row.unit_of_measure_id,
      unitFactor: Number(row.unit_factor),
      unitCost: money(row.unit_cost_amount, row.unit_cost_currency),
      lotNumber: row.lot_number,
      expiryDate: row.expiry_text,
      reasonId: row.reason_id,
      postedValue: money(row.posted_value_amount, row.posted_value_currency),
      notes: row.notes,
    }));
  }

  async replaceLines(db: Kysely<TenantDatabase>, adjustmentId: string, lines: StockAdjustmentLineRow[]): Promise<void> {
    await db.deleteFrom('stock_adjustment_lines').where('stock_adjustment_id', '=', adjustmentId).execute();
    if (lines.length === 0) return;
    await db
      .insertInto('stock_adjustment_lines')
      .values(
        lines.map((line, index) => ({
          id: randomUUID(),
          stock_adjustment_id: adjustmentId,
          line_number: index + 1,
          product_variant_id: line.productVariantId,
          direction: line.direction,
          quantity: String(line.quantity),
          unit_of_measure_id: line.unitOfMeasureId,
          unit_factor: String(line.unitFactor),
          unit_cost_amount: line.unitCost ? line.unitCost.toMinorUnits().toString() : null,
          unit_cost_currency: line.unitCost ? line.unitCost.currency : null,
          lot_number: line.lotNumber,
          expiry_date: line.expiryDate,
          reason_id: line.reasonId,
          notes: line.notes,
        })),
      )
      .execute();
  }

  async setPostedValue(db: Kysely<TenantDatabase>, lineId: string, value: Money): Promise<void> {
    await db
      .updateTable('stock_adjustment_lines')
      .set({
        posted_value_amount: value.toMinorUnits().toString(),
        posted_value_currency: value.currency,
        updated_at: sql<Date>`now()`,
      })
      .where('id', '=', lineId)
      .execute();
  }
}
