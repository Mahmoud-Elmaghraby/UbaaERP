import type { Money } from '@erp-platform/shared-kernel';

export type StockMovementType =
  | 'in'
  | 'out'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment_increase'
  | 'adjustment_decrease';

export interface StockMovement {
  id: string;
  productVariantId: string;
  /** The specific location this movement happened at (source of truth). */
  locationId: string;
  /** Denormalized from the location at write time, for warehouse-level rollups. */
  warehouseId: string;
  movementType: StockMovementType;
  quantity: number;
  unitCost: Money | null;
  /** Exact value this movement added / took (unitCost × quantity can differ by rounding). */
  totalCost: Money | null;
  resultingAverageCost: Money;
  referenceType: string | null;
  referenceId: string | null;
  relatedMovementId: string | null;
  /**
   * Set for lot/serial-tracked products when exactly one lot was involved
   * (always true for incoming movements; true for an outgoing movement
   * that an explicit lotId or single-lot FIFO selection could satisfy on
   * its own). Null for non-lot-tracked products, and for an outgoing
   * movement whose FIFO-by-expiry selection had to span multiple lots —
   * see stock_lot_consumptions for that case's per-lot breakdown.
   */
  stockLotId: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
}

/** Movement types that increase quantity on hand. */
export const INCOMING_MOVEMENT_TYPES: readonly StockMovementType[] = ['in', 'transfer_in', 'adjustment_increase'];

/** Movement types that decrease quantity on hand. */
export const OUTGOING_MOVEMENT_TYPES: readonly StockMovementType[] = ['out', 'transfer_out', 'adjustment_decrease'];

/**
 * Movement types StockMovementsService.recordMovement() accepts directly.
 * 'transfer_in'/'transfer_out' are deliberately excluded — they are only
 * ever created as a linked pair by StockMovementsService.transferStock(),
 * which carries the cost basis from the source location across to the
 * destination rather than letting a caller assert an arbitrary transfer cost.
 */
export type DirectStockMovementType = 'in' | 'out' | 'adjustment_increase' | 'adjustment_decrease';

export interface RecordStockMovementInput {
  productVariantId: string;
  /** Always a specific location — even a warehouse with no custom locations has its auto-created default one. */
  locationId: string;
  movementType: DirectStockMovementType;
  /** In `unitOfMeasureId` when given, otherwise already in the product's own (base) unit of measure. */
  quantity: number;
  /**
   * Optional purchase/sale unit (e.g. recording a movement in "box" while
   * the product is stock-kept in "piece"). When given and different from
   * the product's own unit of measure, `quantity` and `unitCost` are
   * converted to the product's base unit before anything is persisted —
   * stock_levels/stock_movements always store quantities in the product's
   * own unit, never in whatever unit the caller happened to use.
   */
  unitOfMeasureId?: string;
  /**
   * Required for 'in' (a real incoming cost — e.g. a purchase — recalculates
   * the weighted average). Optional for 'adjustment_increase' (defaults to
   * the current average cost, i.e. the adjustment corrects quantity only,
   * not valuation). Ignored for 'out' and 'adjustment_decrease', which
   * always use the current average cost and never change it.
   * When `unitOfMeasureId` is set, this is the cost per unit of THAT unit
   * (e.g. cost per box), not per base unit — it is converted alongside quantity.
   */
  unitCost?: Money;
  /**
   * Incoming only, optional: the exact value of the whole movement (e.g. a
   * receipt line's quantity × price before any per-unit rounding). When
   * given, it — not unitCost × quantity — is what the stock value grows by.
   */
  totalCost?: Money;
  /**
   * Required for 'in'/'adjustment_increase' when the product is lot/serial
   * tracked: the lot/serial number being received into. Creates a new
   * stock_lots row (at `unitCost`) the first time this lot number is seen
   * for this variant; a repeat receipt into an existing lot number just
   * adds quantity — the lot's cost, once set, does not change.
   */
  lotNumber?: string;
  /** Lot-tracked products only: sets the lot's expiry date on first receipt of a new lot number. Ignored on a repeat receipt. */
  expiryDate?: Date | null;
  /**
   * Outgoing movements ('out'/'adjustment_decrease') on a lot/serial
   * tracked product: consume from this specific lot instead of the
   * default FIFO-by-expiry-date selection across all lots at the location.
   */
  lotId?: string;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

export interface TransferStockInput {
  productVariantId: string;
  quantity: number;
  /** Source and destination can be two locations in the same warehouse (a bin-to-bin move) or different warehouses. */
  fromLocationId: string;
  toLocationId: string;
  /**
   * Required when the product is lot/serial tracked: which lot to move.
   * Transfers deliberately don't auto-FIFO across multiple lots the way
   * an outgoing sale/consumption can — moving a specific batch between
   * locations is normally a deliberate, single-lot operation.
   */
  lotId?: string;
  notes?: string | null;
  createdBy?: string | null;
}

export interface TransferStockResult {
  transferOut: StockMovement;
  transferIn: StockMovement;
}
