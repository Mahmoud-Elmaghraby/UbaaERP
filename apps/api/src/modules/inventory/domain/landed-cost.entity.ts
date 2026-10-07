import type { Money } from '@erp-platform/shared-kernel';

export type LandedCostAllocationMethod = 'by_quantity' | 'by_value';

export interface LandedCostAllocation {
  id: string;
  landedCostId: string;
  stockMovementId: string;
  productVariantId: string;
  locationId: string;
  warehouseId: string;
  allocatedAmount: Money;
  /**
   * The part of allocatedAmount that belonged to goods already sold — sent
   * to cost of goods sold, not to the stock value (same currency).
   */
  expensedAmount: Money;
  /** The (variant, location) average cost immediately after this allocation was applied. */
  resultingAverageCost: Money;
  createdAt: Date;
}

export interface LandedCost {
  id: string;
  totalCost: Money;
  allocationMethod: LandedCostAllocationMethod;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
  allocations: LandedCostAllocation[];
}

export interface ApplyLandedCostInput {
  totalCost: Money;
  allocationMethod: LandedCostAllocationMethod;
  /**
   * The incoming ('in') stock movements this cost is spread across — e.g.
   * every receipt line on one purchase invoice's shipment. The share of
   * goods still on hand raises the stock value; the share of goods already
   * sold is expensed to cost of goods sold.
   */
  stockMovementIds: string[];
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}
