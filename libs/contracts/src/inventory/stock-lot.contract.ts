import { z } from 'zod';
import { moneySchema } from './money.contract';

export const stockLotLevelSchema = z.object({
  id: z.string().uuid(),
  stockLotId: z.string().uuid(),
  locationId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantityOnHand: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type StockLotLevelDto = z.infer<typeof stockLotLevelSchema>;

export const stockLotSchema = z.object({
  id: z.string().uuid(),
  productVariantId: z.string().uuid(),
  lotNumber: z.string(),
  expiryDate: z.coerce.date().nullable(),
  unitCost: moneySchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  levels: z.array(stockLotLevelSchema),
});
export type StockLotDto = z.infer<typeof stockLotSchema>;
