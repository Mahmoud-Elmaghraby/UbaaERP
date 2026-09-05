import { z } from 'zod';
import { warehouseLocationSchema } from './warehouse-location.contract';

export const warehouseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().nullable(),
  branchId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type WarehouseDto = z.infer<typeof warehouseSchema>;

export const warehouseWithDefaultLocationSchema = warehouseSchema.extend({
  defaultLocation: warehouseLocationSchema,
});
export type WarehouseWithDefaultLocationDto = z.infer<typeof warehouseWithDefaultLocationSchema>;

export const createWarehouseSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateWarehouseDto = z.infer<typeof createWarehouseSchema>;

export const updateWarehouseSchema = createWarehouseSchema.partial();
export type UpdateWarehouseDto = z.infer<typeof updateWarehouseSchema>;
