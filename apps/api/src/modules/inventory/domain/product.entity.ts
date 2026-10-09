import type { Money } from '@erp-platform/shared-kernel';

export type ProductTrackingType = 'none' | 'lot' | 'serial';

/** 'stock' items move inventory; 'service' items (labour, delivery, printing service…) never do. */
export type ProductItemType = 'stock' | 'service';

export interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unitOfMeasureId: string;
  trackVariants: boolean;
  /**
   * 'none' (the default): plain quantity tracking, as before.
   * 'lot': batches with an optional expiry date, consumed FIFO-by-expiry
   * (StockMovementsService) unless a specific lot is picked explicitly.
   * 'serial': one uniquely-identified unit per "lot" — enforced by
   * StockMovementsService requiring quantity === 1 on every movement.
   */
  trackingType: ProductTrackingType;
  attributes: string[];
  isActive: boolean;
  customFields: Record<string, unknown>;
  itemType: ProductItemType;
  categoryId: string | null;
  brandId: string | null;
  /** Default selling price, prefilled on sales lines and POS. */
  salePrice: Money | null;
  /** Default purchase price, prefilled on purchase lines. */
  purchasePrice: Money | null;
  /** Default tax rule (Settings › Taxes). */
  taxRuleId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Master-data fields shared by create and update. */
export interface ProductMasterDataInput {
  itemType?: ProductItemType;
  categoryId?: string | null;
  brandId?: string | null;
  salePrice?: Money | null;
  purchasePrice?: Money | null;
  taxRuleId?: string | null;
}

export interface CreateProductInput extends ProductMasterDataInput {
  /** Omitted when Inventory settings generate item codes automatically. */
  code?: string;
  name: string;
  description?: string | null;
  /** Omitted → Inventory settings' default unit. */
  unitOfMeasureId?: string;
  trackVariants?: boolean;
  trackingType?: ProductTrackingType;
  attributes?: string[];
  isActive?: boolean;
  customFields?: Record<string, unknown>;
  /** Options whose every combination becomes a variant, created with the product. */
  variantOptions?: Record<string, string[]>;
  /**
   * When trackVariants is false (the common case), the service creates a
   * single default variant for this product. Its SKU defaults to the
   * product's code when omitted.
   */
  defaultVariantSku?: string;
  /** Barcode for the auto-created default variant (simple, non-variant products). */
  defaultVariantBarcode?: string | null;
}

export interface UpdateProductInput extends ProductMasterDataInput {
  code?: string;
  name?: string;
  description?: string | null;
  unitOfMeasureId?: string;
  trackVariants?: boolean;
  trackingType?: ProductTrackingType;
  attributes?: string[];
  isActive?: boolean;
  customFields?: Record<string, unknown>;
}
