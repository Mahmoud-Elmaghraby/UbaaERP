import type { Money } from '@erp-platform/shared-kernel';

export type AdjustmentDirection = 'increase' | 'decrease';
export type ReasonDirection = AdjustmentDirection | 'both';
export type StockAdjustmentStatus = 'draft' | 'posted' | 'cancelled';

/** Why stock was adjusted (migration 0084). `accountId` = its own GL counter-account, else Accounting's default. */
export interface StockAdjustmentReason {
  id: string;
  name: string;
  direction: ReasonDirection;
  accountId: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockAdjustmentReasonInput {
  name: string;
  direction?: ReasonDirection;
  accountId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface StockAdjustment {
  id: string;
  adjustmentNumber: string;
  status: StockAdjustmentStatus;
  warehouseId: string;
  locationId: string;
  reasonId: string | null;
  adjustmentDate: string;
  notes: string | null;
  createdBy: string | null;
  postedBy: string | null;
  postedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockAdjustmentLine {
  id: string;
  stockAdjustmentId: string;
  lineNumber: number;
  productVariantId: string;
  direction: AdjustmentDirection;
  /** In the line's unit. */
  quantity: number;
  unitOfMeasureId: string | null;
  unitFactor: number;
  /** Increase only: cost per LINE unit; null = current average cost. */
  unitCost: Money | null;
  lotNumber: string | null;
  expiryDate: string | null;
  /** Overrides the document's reason for this line. */
  reasonId: string | null;
  /** Exact stock value the line added/removed, set at posting. */
  postedValue: Money | null;
  notes: string | null;
}

export interface StockAdjustmentWithLines extends StockAdjustment {
  lines: StockAdjustmentLine[];
}

export interface StockAdjustmentLineInput {
  productVariantId: string;
  direction: AdjustmentDirection;
  quantity: number;
  unitOfMeasureId?: string | null;
  unitCost?: Money | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
  reasonId?: string | null;
  notes?: string | null;
}

export interface CreateStockAdjustmentInput {
  warehouseId: string;
  locationId?: string | null;
  reasonId?: string | null;
  adjustmentDate?: string | null;
  notes?: string | null;
  lines: StockAdjustmentLineInput[];
}
