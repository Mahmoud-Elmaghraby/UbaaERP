import { z } from 'zod';
import { moneySchema } from './money.contract';

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
});
export type ProductVariantLookupDto = z.infer<typeof productVariantLookupSchema>;
