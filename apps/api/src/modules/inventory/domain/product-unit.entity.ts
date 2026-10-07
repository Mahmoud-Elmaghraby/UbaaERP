import type { Money } from '@erp-platform/shared-kernel';

/**
 * An extra unit one product is traded in (migration 0079): `factor` base
 * units per 1 of this unit — a carton of 12, a 50 kg sack, a box of 3
 * strips. The product's own unit of measure is the base (factor 1) and is
 * never stored as a ProductUnit.
 */
export interface ProductUnit {
  id: string;
  productId: string;
  unitOfMeasureId: string;
  factor: number;
  /** Own price for this unit; null = base price × factor. */
  salePrice: Money | null;
  purchasePrice: Money | null;
  isDefaultSale: boolean;
  isDefaultPurchase: boolean;
}

export interface ProductUnitInput {
  unitOfMeasureId: string;
  factor: number;
  salePrice?: Money | null;
  purchasePrice?: Money | null;
  isDefaultSale?: boolean;
  isDefaultPurchase?: boolean;
}

/** One unit as the catalogue lookup carries it (with the unit's name/symbol). */
export interface ProductUnitLookup {
  unitOfMeasureId: string;
  name: string;
  symbol: string;
  factor: number;
  salePrice: Money | null;
  purchasePrice: Money | null;
  isDefaultSale: boolean;
  isDefaultPurchase: boolean;
}
