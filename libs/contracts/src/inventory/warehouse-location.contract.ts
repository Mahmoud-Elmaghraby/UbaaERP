import { z } from 'zod';

export const warehouseLocationSchema = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type WarehouseLocationDto = z.infer<typeof warehouseLocationSchema>;

export const createWarehouseLocationSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean().optional(),
});
export type CreateWarehouseLocationDto = z.infer<typeof createWarehouseLocationSchema>;

export const updateWarehouseLocationSchema = createWarehouseLocationSchema.partial();
export type UpdateWarehouseLocationDto = z.infer<typeof updateWarehouseLocationSchema>;
