import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  StockTransferLineRow,
  StockTransferListFilter,
  StockTransferRepository,
} from '../../application/ports/stock-transfer.repository';
import type {
  DispatchedPiece,
  StockTransfer,
  StockTransferLine,
  StockTransferStatus,
  TransferLotRequest,
} from '../../domain/stock-transfer.entity';

// DATE read as 'YYYY-MM-DD' text so no time zone ever shifts the day.
const HEADER_COLUMNS = [
  'id',
  'transfer_number',
  'status',
  'from_warehouse_id',
  'from_location_id',
  'to_warehouse_id',
  'to_location_id',
  sql<string>`to_char(transfer_date, 'YYYY-MM-DD')`.as('transfer_date'),
  'notes',
  'created_by',
  'dispatched_by',
  'dispatched_at',
  'received_by',
  'received_at',
  'cancelled_by',
  'cancelled_at',
  'created_at',
  'updated_at',
] as const;

interface HeaderRow {
  id: string;
  transfer_number: string;
  status: string;
  from_warehouse_id: string;
  from_location_id: string;
  to_warehouse_id: string;
  to_location_id: string;
  transfer_date: string;
  notes: string | null;
  created_by: string | null;
  dispatched_by: string | null;
  dispatched_at: Date | null;
  received_by: string | null;
  received_at: Date | null;
  cancelled_by: string | null;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function headerToDomain(row: HeaderRow): StockTransfer {
  return {
    id: row.id,
    transferNumber: row.transfer_number,
    status: row.status as StockTransferStatus,
    fromWarehouseId: row.from_warehouse_id,
    fromLocationId: row.from_location_id,
    toWarehouseId: row.to_warehouse_id,
    toLocationId: row.to_location_id,
    transferDate: row.transfer_date,
    notes: row.notes,
    createdBy: row.created_by,
    dispatchedBy: row.dispatched_by,
    dispatchedAt: row.dispatched_at,
    receivedBy: row.received_by,
    receivedAt: row.received_at,
    cancelledBy: row.cancelled_by,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function jsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  }
  return [];
}

export class KyselyStockTransferRepository implements StockTransferRepository {
  async list(db: Kysely<TenantDatabase>, filter: StockTransferListFilter): Promise<StockTransfer[]> {
    let query = db.selectFrom('stock_transfers').select(HEADER_COLUMNS);
    if (filter.status) query = query.where('status', '=', filter.status);
    if (filter.warehouseId) {
      const warehouseId = filter.warehouseId;
      query = query.where((eb) =>
        eb.or([eb('from_warehouse_id', '=', warehouseId), eb('to_warehouse_id', '=', warehouseId)]),
      );
    }
    const rows = await query.orderBy('created_at', 'desc').limit(1000).execute();
    return rows.map((row) => headerToDomain(row as HeaderRow));
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<StockTransfer | null> {
    const row = await db.selectFrom('stock_transfers').select(HEADER_COLUMNS).where('id', '=', id).executeTakeFirst();
    return row ? headerToDomain(row as HeaderRow) : null;
  }

  async lockForUpdate(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await db.selectFrom('stock_transfers').select('id').where('id', '=', id).forUpdate().execute();
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: Parameters<StockTransferRepository['create']>[1],
  ): Promise<StockTransfer> {
    const id = randomUUID();
    await db
      .insertInto('stock_transfers')
      .values({
        id,
        transfer_number: input.transferNumber,
        from_warehouse_id: input.fromWarehouseId,
        from_location_id: input.fromLocationId,
        to_warehouse_id: input.toWarehouseId,
        to_location_id: input.toLocationId,
        ...(input.transferDate ? { transfer_date: input.transferDate } : {}),
        notes: input.notes,
        created_by: input.createdBy,
      })
      .execute();
    return (await this.findById(db, id))!;
  }

  async updateHeader(
    db: Kysely<TenantDatabase>,
    id: string,
    input: Parameters<StockTransferRepository['updateHeader']>[2],
  ): Promise<StockTransfer | null> {
    await db
      .updateTable('stock_transfers')
      .set({
        ...(input.fromWarehouseId !== undefined ? { from_warehouse_id: input.fromWarehouseId } : {}),
        ...(input.fromLocationId !== undefined ? { from_location_id: input.fromLocationId } : {}),
        ...(input.toWarehouseId !== undefined ? { to_warehouse_id: input.toWarehouseId } : {}),
        ...(input.toLocationId !== undefined ? { to_location_id: input.toLocationId } : {}),
        ...(input.transferDate !== undefined ? { transfer_date: input.transferDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updated_at: sql<Date>`now()`,
      })
      .where('id', '=', id)
      .execute();
    return this.findById(db, id);
  }

  async setStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: StockTransferStatus,
    actor: { userId: string | null; step: 'dispatched' | 'received' | 'cancelled' },
  ): Promise<StockTransfer | null> {
    const stamp =
      actor.step === 'dispatched'
        ? { dispatched_by: actor.userId, dispatched_at: sql<Date>`now()` }
        : actor.step === 'received'
          ? { received_by: actor.userId, received_at: sql<Date>`now()` }
          : { cancelled_by: actor.userId, cancelled_at: sql<Date>`now()` };
    await db
      .updateTable('stock_transfers')
      .set({ status, ...stamp, updated_at: sql<Date>`now()` })
      .where('id', '=', id)
      .execute();
    return this.findById(db, id);
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await db.deleteFrom('stock_transfers').where('id', '=', id).execute();
  }

  async listLines(db: Kysely<TenantDatabase>, transferId: string): Promise<StockTransferLine[]> {
    const rows = await db
      .selectFrom('stock_transfer_lines')
      .selectAll()
      .where('stock_transfer_id', '=', transferId)
      .orderBy('line_number')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      stockTransferId: row.stock_transfer_id,
      lineNumber: row.line_number,
      productVariantId: row.product_variant_id,
      quantity: Number(row.quantity),
      unitOfMeasureId: row.unit_of_measure_id,
      unitFactor: Number(row.unit_factor),
      lots: jsonArray<TransferLotRequest>(row.lot_allocations),
      dispatched: jsonArray<DispatchedPiece>(row.dispatched),
      dispatchedValue:
        row.dispatched_value_amount !== null && row.dispatched_value_currency !== null
          ? Money.fromMinorUnits(BigInt(row.dispatched_value_amount), row.dispatched_value_currency)
          : null,
      receivedQuantity: row.received_quantity === null ? null : Number(row.received_quantity),
      notes: row.notes,
    }));
  }

  async replaceLines(db: Kysely<TenantDatabase>, transferId: string, lines: StockTransferLineRow[]): Promise<void> {
    await db.deleteFrom('stock_transfer_lines').where('stock_transfer_id', '=', transferId).execute();
    if (lines.length === 0) return;
    await db
      .insertInto('stock_transfer_lines')
      .values(
        lines.map((line, index) => ({
          id: randomUUID(),
          stock_transfer_id: transferId,
          line_number: index + 1,
          product_variant_id: line.productVariantId,
          quantity: String(line.quantity),
          unit_of_measure_id: line.unitOfMeasureId,
          unit_factor: String(line.unitFactor),
          lot_allocations: line.lots.length > 0 ? JSON.stringify(line.lots) : null,
          dispatched: null,
          notes: line.notes,
        })),
      )
      .execute();
  }

  async setDispatched(
    db: Kysely<TenantDatabase>,
    lineId: string,
    pieces: DispatchedPiece[],
    value: { amountMinorUnits: string; currency: string } | null,
  ): Promise<void> {
    await db
      .updateTable('stock_transfer_lines')
      .set({
        dispatched: JSON.stringify(pieces),
        dispatched_value_amount: value?.amountMinorUnits ?? null,
        dispatched_value_currency: value?.currency ?? null,
        updated_at: sql<Date>`now()`,
      })
      .where('id', '=', lineId)
      .execute();
  }

  async setReceivedQuantity(db: Kysely<TenantDatabase>, lineId: string, quantity: number): Promise<void> {
    await db
      .updateTable('stock_transfer_lines')
      .set({ received_quantity: String(quantity), updated_at: sql<Date>`now()` })
      .where('id', '=', lineId)
      .execute();
  }

  async inTransitValue(
    db: Kysely<TenantDatabase>,
  ): Promise<{ toWarehouseId: string; currency: string; valueMinorUnits: string; transfers: number }[]> {
    const rows = await db
      .selectFrom('stock_transfer_lines as l')
      .innerJoin('stock_transfers as t', 't.id', 'l.stock_transfer_id')
      .select([
        't.to_warehouse_id as to_warehouse_id',
        'l.dispatched_value_currency as currency',
        sql<string>`COALESCE(SUM(l.dispatched_value_amount), 0)::text`.as('value'),
        sql<string>`COUNT(DISTINCT t.id)::text`.as('transfers'),
      ])
      .where('t.status', '=', 'in_transit')
      .where('l.dispatched_value_currency', 'is not', null)
      .groupBy(['t.to_warehouse_id', 'l.dispatched_value_currency'])
      .execute();
    return rows.map((row) => ({
      toWarehouseId: row.to_warehouse_id,
      currency: row.currency!,
      valueMinorUnits: row.value,
      transfers: Number(row.transfers),
    }));
  }
}
