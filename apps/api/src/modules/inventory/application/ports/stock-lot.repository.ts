import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  StockLot,
  CreateStockLotInput,
  StockLotLevel,
  StockLotWithLevels,
  StockLotConsumption,
} from '../../domain/stock-lot.entity';

export interface ExpiringLotRow {
  stockLotId: string;
  lotNumber: string;
  expiryDate: Date;
  productVariantId: string;
  productName: string;
  productCode: string;
  sku: string;
  warehouseId: string;
  warehouseName: string;
  quantityOnHand: number;
  unitCost: { amountMinorUnits: string; currency: string };
}

/** One lot's available quantity at one location, ordered oldest-expiry-first — the shape FIFO selection consumes. */
export interface AvailableLotLevel {
  stockLotId: string;
  lotNumber: string;
  expiryDate: Date | null;
  quantityAvailable: number;
}

/** How much of one lot a document moved (summed across its movements and multi-lot consumptions). */
export interface LotQuantityMoved {
  stockLotId: string;
  lotNumber: string;
  expiryDate: Date | null;
  quantity: number;
}

export interface StockLotRepository {
  findByVariantAndLotNumber(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    lotNumber: string,
  ): Promise<StockLot | null>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<StockLot | null>;
  listByVariantId(db: Kysely<TenantDatabase>, productVariantId: string): Promise<StockLotWithLevels[]>;
  createLot(db: Kysely<TenantDatabase>, input: CreateStockLotInput): Promise<StockLot>;

  /** Quantity of this lot on hand across every location (0 when it has no level rows). */
  totalQuantityOnHand(db: Kysely<TenantDatabase>, stockLotId: string): Promise<number>;
  findLevel(db: Kysely<TenantDatabase>, stockLotId: string, locationId: string): Promise<StockLotLevel | null>;
  /** Creates the (lot, location) row on first use, or updates its quantity — always inside the movement's own transaction. */
  upsertLevel(
    db: Kysely<TenantDatabase>,
    input: { stockLotId: string; locationId: string; warehouseId: string; quantityOnHand: number },
  ): Promise<StockLotLevel>;

  /**
   * Lots with quantity > 0 for this (variant, location), oldest expiry
   * first (nulls last), then oldest-created first — the FIFO-by-expiry
   * consumption order StockMovementsService draws from.
   */
  listAvailableForFifo(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    locationId: string,
    options?: { excludeExpired?: boolean },
  ): Promise<AvailableLotLevel[]>;

  /** True when the lot has an expiry date earlier than today (database date). */
  isExpired(db: Kysely<TenantDatabase>, stockLotId: string): Promise<boolean>;

  /**
   * The lots a document's movements touched for one variant — used by
   * returns to put stock back into (sales return) or take it out of
   * (purchase return) the same lots the original document moved.
   */
  lotsMovedByReference(
    db: Kysely<TenantDatabase>,
    referenceType: string,
    referenceId: string,
    productVariantId: string,
  ): Promise<LotQuantityMoved[]>;

  /**
   * Lots with stock on hand expiring on or before `untilDate` (already
   * expired included), soonest first — the near-expiry report.
   */
  listExpiring(db: Kysely<TenantDatabase>, untilDate: string): Promise<ExpiringLotRow[]>;

  createConsumption(
    db: Kysely<TenantDatabase>,
    input: { stockMovementId: string; stockLotId: string; quantity: number },
  ): Promise<StockLotConsumption>;
  listConsumptionsByMovementId(db: Kysely<TenantDatabase>, stockMovementId: string): Promise<StockLotConsumption[]>;
}

export const STOCK_LOT_REPOSITORY = Symbol('STOCK_LOT_REPOSITORY');
