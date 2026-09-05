import { z } from 'zod';
import { productVariantSchema } from './product-variant.contract';

export const productTrackingTypeSchema = z.enum(['none', 'lot', 'serial']);
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
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ProductDto = z.infer<typeof productSchema>;

export const productWithVariantsSchema = productSchema.extend({
  variants: z.array(productVariantSchema),
});
export type ProductWithVariantsDto = z.infer<typeof productWithVariantsSchema>;

export const createProductSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  unitOfMeasureId: z.string().uuid(),
  trackVariants: z.boolean().optional(),
  trackingType: productTrackingTypeSchema.optional(),
  attributes: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  customFields: z.record(z.unknown()).optional(),
  defaultVariantSku: z.string().min(1).optional(),
});
export type CreateProductDto = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.omit({ defaultVariantSku: true }).partial();
export type UpdateProductDto = z.infer<typeof updateProductSchema>;
