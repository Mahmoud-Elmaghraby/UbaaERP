import { z } from 'zod';

export const productCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  parentId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ProductCategoryDto = z.infer<typeof productCategorySchema>;

export const createProductCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type CreateProductCategoryDto = z.infer<typeof createProductCategorySchema>;

export const updateProductCategorySchema = createProductCategorySchema.partial();
export type UpdateProductCategoryDto = z.infer<typeof updateProductCategorySchema>;

export const productBrandSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ProductBrandDto = z.infer<typeof productBrandSchema>;

export const createProductBrandSchema = z.object({
  name: z.string().trim().min(1).max(120),
  isActive: z.boolean().optional(),
});
export type CreateProductBrandDto = z.infer<typeof createProductBrandSchema>;

export const updateProductBrandSchema = createProductBrandSchema.partial();
export type UpdateProductBrandDto = z.infer<typeof updateProductBrandSchema>;
