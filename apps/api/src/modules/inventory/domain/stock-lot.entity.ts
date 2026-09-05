import type { Money } from '@erp-platform/shared-kernel';

/**
 * A lot/batch (or, for serial-tracked products, a single serialized unit)
 * of one product variant. Cost is fixed at creation — a physical batch has
 * one purchase cost — and does not get re-averaged if more stock is later
 * received under the same lot number (see StockMovementsService).
 */
export interface StockLot {
  id: string;
  productVariantId: string;
  lotNumber: string;
  expiryDate: Date | null;
  unitCost: Money;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStockLotInput {
  productVariantId: string;
  lotNumber: string;
  expiryDate?: Date | null;
  unitCost: Money;
}

/** How much of one lot sits at one location — independent of stock_levels' (variant, location) aggregate. */
export interface StockLotLevel {
  id: string;
  stockLotId: string;
  locationId: string;
  warehouseId: string;
  quantityOnHand: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A lot with the location-level quantities the caller asked for attached — the shape lot-listing endpoints return. */
export interface StockLotWithLevels extends StockLot {
  levels: StockLotLevel[];
}

/**
 * Audit trail for an outgoing movement whose FIFO-by-expiry selection had
 * to draw from more than one lot: stock_movements.quantity stays a single
 * number, but exactly how much came from which lot is preserved here.
 */
export interface StockLotConsumption {
  id: string;
  stockMovementId: string;
  stockLotId: string;
  quantity: number;
  createdAt: Date;
}
