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
