import { z } from 'zod';
import { barcodeInputSchema, productVariantSchema } from './product-variant.contract';
import { moneySchema, nonNegativeMoneySchema } from './money.contract';

export const productTrackingTypeSchema = z.enum(['none', 'lot', 'serial']);

/** 'stock' items move inventory; 'service' items never do. */
export const productItemTypeSchema = z.enum(['stock', 'service']);
export type ProductItemTypeDto = z.infer<typeof productItemTypeSchema>;
export type ProductTrackingTypeDto = z.infer<typeof productTrackingTypeSchema>;

export const productSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  unitOfMeasureId: z.string().uuid(),
  trackVariants: z.boolean(),
  trackingType: productTrackingTypeSchema,
  attributes: z.array(z.string()),
  isActive: z.boolean(),
  customFields: z.record(z.unknown()),
  itemType: productItemTypeSchema,
  categoryId: z.string().uuid().nullable(),
  brandId: z.string().uuid().nullable(),
  salePrice: moneySchema.nullable(),
  purchasePrice: moneySchema.nullable(),
  taxRuleId: z.string().uuid().nullable(),
  /** Thumbnail of the primary image (presigned, cache-friendly) — migration 0085. */
  imageUrl: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ProductDto = z.infer<typeof productSchema>;

export const productWithVariantsSchema = productSchema.extend({
  variants: z.array(productVariantSchema),
});
export type ProductWithVariantsDto = z.infer<typeof productWithVariantsSchema>;

export const createProductSchema = z.object({
  /** Optional: when omitted, Inventory settings decide (auto code, or a "code required" error). */
  code: z.string().trim().min(1).optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  unitOfMeasureId: z.string().uuid(),
  trackVariants: z.boolean().optional(),
  trackingType: productTrackingTypeSchema.optional(),
  attributes: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  customFields: z.record(z.unknown()).optional(),
  itemType: productItemTypeSchema.optional(),
  categoryId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  salePrice: nonNegativeMoneySchema.nullable().optional(),
  purchasePrice: nonNegativeMoneySchema.nullable().optional(),
  taxRuleId: z.string().uuid().nullable().optional(),
  defaultVariantSku: z.string().min(1).optional(),
  /** Barcode for the auto-created default variant of a simple (non-variant) product. */
  defaultVariantBarcode: barcodeInputSchema.optional(),
});
export type CreateProductDto = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema
  .omit({ defaultVariantSku: true, defaultVariantBarcode: true })
  .partial();
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

// ---- item images (migration 0085) ----
export const productImageSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productVariantId: z.string().uuid().nullable(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  isPrimary: z.boolean(),
  sortOrder: z.number().int(),
  url: z.string(),
  thumbnailUrl: z.string(),
  createdAt: z.coerce.date(),
});
export type ProductImageDto = z.infer<typeof productImageSchema>;

export const uploadProductImageSchema = z.object({
  productVariantId: z.string().uuid().nullable().optional(),
});
export type UploadProductImageDto = z.infer<typeof uploadProductImageSchema>;

export const reorderProductImagesSchema = z.object({ imageIds: z.array(z.string().uuid()).min(1).max(50) });
export type ReorderProductImagesDto = z.infer<typeof reorderProductImagesSchema>;

// ---- Excel import of the item master ----
const importCell = z.string().max(2000).nullable().optional();
export const productImportRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  code: importCell,
  name: importCell,
  description: importCell,
  barcode: importCell,
  category: importCell,
  brand: importCell,
  unit: importCell,
  itemType: importCell,
  trackingType: importCell,
  salePrice: importCell,
  purchasePrice: importCell,
  isActive: importCell,
  openingQuantity: importCell,
  openingCost: importCell,
});
export type ProductImportRowDto = z.infer<typeof productImportRowSchema>;

export const productImportRequestSchema = z.object({
  rows: z.array(productImportRowSchema).min(1).max(5000),
  mode: z.enum(['create', 'upsert']).default('create'),
  dryRun: z.boolean().default(true),
  skipInvalid: z.boolean().default(false),
  createMissingCategories: z.boolean().default(true),
  createMissingBrands: z.boolean().default(true),
  createMissingUnits: z.boolean().default(false),
  openingWarehouseId: z.string().uuid().nullable().optional(),
});
export type ProductImportRequestDto = z.input<typeof productImportRequestSchema>;

export const productImportResultSchema = z.object({
  dryRun: z.boolean(),
  committed: z.boolean(),
  created: z.number().int(),
  updated: z.number().int(),
  failed: z.number().int(),
  openingCountId: z.string().uuid().nullable(),
  rows: z.array(
    z.object({
      rowNumber: z.number().int(),
      status: z.enum(['create', 'update', 'error']),
      code: z.string().nullable(),
      name: z.string().nullable(),
      errors: z.array(z.object({ field: z.string(), message: z.string() })),
      productId: z.string().uuid().nullable(),
    }),
  ),
});
export type ProductImportResultDto = z.infer<typeof productImportResultSchema>;
