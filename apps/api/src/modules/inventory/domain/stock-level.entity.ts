import type { Money } from '@erp-platform/shared-kernel';

export interface StockLevel {
  id: string;
  productVariantId: string;
  /** The location this stock actually sits in (source of truth). */
  locationId: string;
  /** Denormalized from the location at write time, for warehouse-level rollups. */
  warehouseId: string;
  quantityOnHand: number;
  reorderPoint: number | null;
  averageCost: Money;
  /** Total value of the stock at this location (source of truth; averageCost = value / quantity, rounded for display). */
  inventoryValue: Money;
  createdAt: Date;
  updatedAt: Date;
}

/** True when quantityOnHand is at or below reorderPoint (the alerts-panel condition). */
export function isBelowReorderPoint(level: Pick<StockLevel, 'quantityOnHand' | 'reorderPoint'>): boolean {
  return level.reorderPoint !== null && level.quantityOnHand <= level.reorderPoint;
}
