import type { Money } from '@erp-platform/shared-kernel';

/**
 * Stock count document — opening balance (رصيد أول المدة) or stocktake
 * (الجرد). See migration 0078 for the semantics of each kind.
 */
export type StockCountKind = 'opening' | 'stocktake';
export type StockCountStatus = 'draft' | 'posted' | 'cancelled';

export interface StockCount {
  id: string;
  countNumber: string;
  kind: StockCountKind;
  warehouseId: string;
  status: StockCountStatus;
  /** YYYY-MM-DD */
  countDate: string | null;
  notes: string | null;
  createdBy: string | null;
  postedBy: string | null;
  postedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockCountLine {
  id: string;
  stockCountId: string;
  productVariantId: string;
  locationId: string;
  lotNumber: string | null;
  /** YYYY-MM-DD */
  expiryDate: string | null;
  /** On-hand when the line was added / last refreshed (stocktake only; 0 for opening). */
  systemQuantity: number;
  /** null = not counted yet (skipped when posting a stocktake). */
  countedQuantity: number | null;
  unitCost: Money | null;
}

export interface StockCountWithLines extends StockCount {
  lines: StockCountLine[];
}

export interface CreateStockCountInput {
  kind: StockCountKind;
  warehouseId: string;
  countDate?: string | null;
  notes?: string | null;
}

/** One line to add or update — keyed by (variant, location, lot). */
export interface UpsertStockCountLineInput {
  productVariantId: string;
  /** Defaults to the warehouse's DEFAULT location. */
  locationId?: string;
  lotNumber?: string | null;
  expiryDate?: string | null;
  countedQuantity: number | null;
  unitCost?: Money | null;
}

/** What posting changed — returned to the caller and written to the outbox for Accounting. */
export interface StockCountPostingLine {
  productVariantId: string;
  lotNumber: string | null;
  /** Signed: + increase, − decrease. */
  quantityDelta: number;
  unitCost: Money;
}
