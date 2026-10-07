import type { ProductUnitLookup } from './product-unit.entity';
import type { Money } from '@erp-platform/shared-kernel';

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  attributeValues: Record<string, unknown>;
  barcode: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductVariantInput {
  productId: string;
  sku: string;
  attributeValues?: Record<string, unknown>;
  barcode?: string | null;
  isActive?: boolean;
}

export interface UpdateProductVariantInput {
  sku?: string;
  attributeValues?: Record<string, unknown>;
  barcode?: string | null;
  isActive?: boolean;
}

/**
 * One sellable/purchasable variant flattened with the product fields every
 * document picker needs (name, code, unit, tracking) — returned for the
 * whole catalogue in ONE query so the frontend never fetches product by
 * product (inventory audit 2026-10: the old per-product N+1).
 */
export interface ProductVariantLookup {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  sku: string;
  barcode: string | null;
  attributeValues: Record<string, unknown>;
  isActive: boolean;
  productIsActive: boolean;
  unitOfMeasureId: string;
  unitOfMeasureSymbol: string;
  trackingType: 'none' | 'lot' | 'serial';
  itemType: 'stock' | 'service';
  categoryId: string | null;
  brandId: string | null;
  /** Prefilled on sales lines / POS. */
  salePrice: Money | null;
  /** Prefilled on purchase lines. */
  purchasePrice: Money | null;
  taxRuleId: string | null;
  /** Extra / pack barcodes (the primary one is `barcode`). */
  extraBarcodes: { barcode: string; quantity: number; label: string | null }[];
  /** The product's extra trading units (carton, sack…) — migration 0079. */
  units: ProductUnitLookup[];
}

/**
 * An extra barcode for a variant (migration 0076): an alternate code, or a
 * pack/carton code where one scan means `quantity` base units.
 */
export interface ProductBarcode {
  id: string;
  productVariantId: string;
  barcode: string;
  quantity: number;
  label: string | null;
  createdAt: Date;
}

export interface CreateProductBarcodeInput {
  productVariantId: string;
  barcode: string;
  quantity?: number;
  label?: string | null;
}
