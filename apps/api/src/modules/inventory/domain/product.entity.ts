export type ProductTrackingType = 'none' | 'lot' | 'serial';

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
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductInput {
  code: string;
  name: string;
  description?: string | null;
  unitOfMeasureId: string;
  trackVariants?: boolean;
  trackingType?: ProductTrackingType;
  attributes?: string[];
  isActive?: boolean;
  customFields?: Record<string, unknown>;
  /**
   * When trackVariants is false (the common case), the service creates a
   * single default variant for this product. Its SKU defaults to the
   * product's code when omitted.
   */
  defaultVariantSku?: string;
}

export interface UpdateProductInput {
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
