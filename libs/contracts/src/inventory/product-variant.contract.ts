import { z } from 'zod';

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

export const createProductVariantSchema = z.object({
  sku: z.string().min(1),
  attributeValues: z.record(z.unknown()).optional(),
  barcode: z.string().nullable().optional(),
});
export type CreateProductVariantDto = z.infer<typeof createProductVariantSchema>;
