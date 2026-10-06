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

/** One row of the near-expiry report: a lot on hand in one warehouse, expiring soon (or already expired). */
export const expiringLotSchema = z.object({
  stockLotId: z.string().uuid(),
  lotNumber: z.string(),
  expiryDate: z.coerce.date(),
  daysToExpiry: z.number().int(),
  productVariantId: z.string().uuid(),
  productName: z.string(),
  productCode: z.string(),
  sku: z.string(),
  warehouseId: z.string().uuid(),
  warehouseName: z.string(),
  quantityOnHand: z.number(),
  unitCost: moneySchema,
});
export type ExpiringLotDto = z.infer<typeof expiringLotSchema>;
