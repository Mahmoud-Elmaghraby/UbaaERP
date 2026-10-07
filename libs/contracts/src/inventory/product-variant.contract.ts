import { z } from 'zod';
import { moneySchema, nonNegativeMoneySchema } from './money.contract';

export const productVariantSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  sku: z.string().min(1),
  attributeValues: z.record(z.unknown()),
  barcode: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ProductVariantDto = z.infer<typeof productVariantSchema>;

/** A scanned/typed barcode: trimmed, blank means "no barcode". */
export const barcodeInputSchema = z
  .string()
  .trim()
  .max(64)
  .transform((value) => (value === '' ? null : value))
  .nullable();

export const createProductVariantSchema = z.object({
  /** Optional: defaults to the product code (first variant) or code-2, code-3… */
  sku: z.string().trim().min(1).optional(),
  attributeValues: z.record(z.unknown()).optional(),
  barcode: barcodeInputSchema.optional(),
});
export type CreateProductVariantDto = z.infer<typeof createProductVariantSchema>;

export const updateProductVariantSchema = z
  .object({
    sku: z.string().trim().min(1),
    attributeValues: z.record(z.unknown()),
    barcode: barcodeInputSchema,
    isActive: z.boolean(),
  })
  .partial();
export type UpdateProductVariantDto = z.infer<typeof updateProductVariantSchema>;

/**
 * One row per variant across the whole catalogue (GET /product-variants) —
 * what every document line picker, POS search and barcode scan resolves
 * against, fetched once instead of product by product.
 */
export const productVariantLookupSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productCode: z.string(),
  productName: z.string(),
  sku: z.string(),
  barcode: z.string().nullable(),
  attributeValues: z.record(z.unknown()),
  isActive: z.boolean(),
  productIsActive: z.boolean(),
  unitOfMeasureId: z.string().uuid(),
  unitOfMeasureSymbol: z.string(),
  trackingType: z.enum(['none', 'lot', 'serial']),
  itemType: z.enum(['stock', 'service']),
  categoryId: z.string().uuid().nullable(),
  brandId: z.string().uuid().nullable(),
  salePrice: moneySchema.nullable(),
  purchasePrice: moneySchema.nullable(),
  taxRuleId: z.string().uuid().nullable(),
  /** Thumbnail of the item's primary image, or null (migration 0085). */
  imageUrl: z.string().nullable().optional(),
  /** Extra / pack barcodes; `quantity` = base units one scan stands for. */
  extraBarcodes: z.array(z.object({ barcode: z.string(), quantity: z.number(), label: z.string().nullable() })),
  /** Extra trading units of the product (carton, sack…); the base unit is unitOfMeasureId (factor 1). */
  units: z
    .array(
      z.object({
        unitOfMeasureId: z.string().uuid(),
        name: z.string(),
        symbol: z.string(),
        factor: z.number(),
        salePrice: moneySchema.nullable(),
        purchasePrice: moneySchema.nullable(),
        isDefaultSale: z.boolean(),
        isDefaultPurchase: z.boolean(),
      }),
    )
    .default([]),
});
export type ProductVariantLookupDto = z.infer<typeof productVariantLookupSchema>;

export const productBarcodeSchema = z.object({
  id: z.string().uuid(),
  productVariantId: z.string().uuid(),
  barcode: z.string(),
  quantity: z.number(),
  label: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type ProductBarcodeDto = z.infer<typeof productBarcodeSchema>;

export const createProductBarcodeSchema = z.object({
  barcode: z.string().trim().min(1).max(64),
  /** Base units one scan stands for — 1 for an alternate code, 12 for a carton of 12. */
  quantity: z.number().positive().max(1_000_000).optional(),
  label: z.string().trim().max(60).nullable().optional(),
});
export type CreateProductBarcodeDto = z.infer<typeof createProductBarcodeSchema>;

/** Variant matrix: attribute name → values, e.g. { "المقاس": ["S","M"], "اللون": ["أحمر"] }. */
export const generateProductVariantsSchema = z.object({
  options: z.record(z.array(z.string().trim().min(1).max(60)).max(100)),
});
export type GenerateProductVariantsDto = z.infer<typeof generateProductVariantsSchema>;

/** A product's extra trading unit (migration 0079). */
export const productUnitSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  unitOfMeasureId: z.string().uuid(),
  factor: z.number().positive(),
  salePrice: moneySchema.nullable(),
  purchasePrice: moneySchema.nullable(),
  isDefaultSale: z.boolean(),
  isDefaultPurchase: z.boolean(),
});
export type ProductUnitDto = z.infer<typeof productUnitSchema>;

export const productUnitInputSchema = z.object({
  unitOfMeasureId: z.string().uuid(),
  factor: z.number().positive().max(1_000_000),
  salePrice: nonNegativeMoneySchema.nullable().optional(),
  purchasePrice: nonNegativeMoneySchema.nullable().optional(),
  isDefaultSale: z.boolean().optional(),
  isDefaultPurchase: z.boolean().optional(),
});
export type ProductUnitInputDto = z.infer<typeof productUnitInputSchema>;

export const replaceProductUnitsSchema = z.object({ units: z.array(productUnitInputSchema).max(20) });
export type ReplaceProductUnitsDto = z.infer<typeof replaceProductUnitsSchema>;

/**
 * The unit a document line is in (migration 0079): null = the product's
 * base unit. Shared by every sales/purchase line schema.
 */
export const lineUnitFieldsSchema = z.object({
  unitOfMeasureId: z.string().uuid().nullable().default(null),
  /** Base units per 1 line unit, frozen when the line was created. */
  unitFactor: z.number().positive().default(1),
});
