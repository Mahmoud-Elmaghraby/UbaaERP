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
   * every receipt line on one purchase invoice's shipment. Each must still
   * have stock on hand at its (variant, location): a landed cost raises
   * the CURRENT average cost of what's still in stock, so it cannot be
   * applied against a movement whose stock has since been fully consumed.
   */
  stockMovementIds: string[];
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}
