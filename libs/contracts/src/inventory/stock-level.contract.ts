import { z } from 'zod';
import { moneySchema } from './money.contract';

export const stockLevelSchema = z.object({
  id: z.string().uuid(),
  productVariantId: z.string().uuid(),
  locationId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantityOnHand: z.number(),
  reorderPoint: z.number().nullable(),
  averageCost: moneySchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type StockLevelDto = z.infer<typeof stockLevelSchema>;

export const setReorderPointSchema = z.object({
  reorderPoint: z.number().min(0).nullable(),
});
export type SetReorderPointDto = z.infer<typeof setReorderPointSchema>;
