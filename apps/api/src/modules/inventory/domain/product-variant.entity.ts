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
