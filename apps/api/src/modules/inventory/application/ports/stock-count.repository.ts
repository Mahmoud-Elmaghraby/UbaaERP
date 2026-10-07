import type { Kysely } from 'kysely';
import type { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { StockCount, StockCountKind, StockCountLine, StockCountStatus } from '../../domain/stock-count.entity';

export interface StockCountLineRow {
  productVariantId: string;
  locationId: string;
  lotNumber: string | null;
  expiryDate: string | null;
  systemQuantity: number;
  countedQuantity: number | null;
  unitCost: Money | null;
}

/** A (variant, location[, lot]) with stock — what "load all items" fills a stocktake with. */
export interface CountableStockRow {
  productVariantId: string;
  locationId: string;
  lotNumber: string | null;
  expiryDate: string | null;
  quantity: number;
}

export interface StockCountRepository {
  list(db: Kysely<TenantDatabase>, filter: { kind?: StockCountKind }): Promise<StockCount[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<StockCount | null>;
  /** Row-locks the count for the rest of the transaction (no double posting). */
  lockForUpdate(db: Kysely<TenantDatabase>, id: string): Promise<void>;
  create(
    db: Kysely<TenantDatabase>,
    input: {
      countNumber: string;
      kind: StockCountKind;
      warehouseId: string;
      countDate: string | null;
      notes: string | null;
      createdBy: string | null;
    },
  ): Promise<StockCount>;
  updateHeader(
    db: Kysely<TenantDatabase>,
    id: string,
    input: { countDate?: string | null; notes?: string | null },
  ): Promise<StockCount | null>;
  setStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: StockCountStatus,
    postedBy?: string | null,
  ): Promise<StockCount | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<void>;

  listLines(db: Kysely<TenantDatabase>, stockCountId: string): Promise<StockCountLine[]>;
  /** Insert or update by (variant, location, lot); `systemQuantity` is only written on insert. */
  upsertLine(db: Kysely<TenantDatabase>, stockCountId: string, row: StockCountLineRow): Promise<StockCountLine>;
  deleteLine(db: Kysely<TenantDatabase>, stockCountId: string, lineId: string): Promise<boolean>;
  setSystemQuantity(db: Kysely<TenantDatabase>, lineId: string, quantity: number): Promise<void>;

  /** Every stock item with stock in the warehouse — per lot for tracked items. */
  listCountableStock(
    db: Kysely<TenantDatabase>,
    warehouseId: string,
    filter: { categoryIds?: string[]; locationIds?: string[] },
  ): Promise<CountableStockRow[]>;
  /** On-hand at a location — for one lot when `lotNumber` is given. */
  currentQuantity(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    locationId: string,
    lotNumber: string | null,
  ): Promise<number>;
}

export const STOCK_COUNT_REPOSITORY = Symbol('STOCK_COUNT_REPOSITORY');
