import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

export const goodsReceiptStatusSchema = z.enum(['draft', 'confirmed', 'cancelled']);
export type GoodsReceiptStatusDto = z.infer<typeof goodsReceiptStatusSchema>;

export const goodsReceiptLineSchema = z.object({
  id: z.string().uuid(),
  goodsReceiptId: z.string().uuid(),
  purchaseOrderLineId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantityReceived: z.number().positive(),
  unitCost: moneySchema,
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type GoodsReceiptLineDto = z.infer<typeof goodsReceiptLineSchema>;

export const goodsReceiptSchema = z.object({
  id: z.string().uuid(),
  receiptNumber: z.string().min(1),
  purchaseOrderId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  status: goodsReceiptStatusSchema,
  receivedDate: z.string().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type GoodsReceiptDto = z.infer<typeof goodsReceiptSchema>;

export const goodsReceiptWithLinesSchema = goodsReceiptSchema.extend({
  lines: z.array(goodsReceiptLineSchema),
});
export type GoodsReceiptWithLinesDto = z.infer<typeof goodsReceiptWithLinesSchema>;

export const createGoodsReceiptLineSchema = z.object({
  purchaseOrderLineId: z.string().uuid(),
  quantityReceived: z.number().positive(),
  unitCost: moneySchema.optional(),
  notes: z.string().nullable().optional(),
});
export type CreateGoodsReceiptLineDto = z.infer<typeof createGoodsReceiptLineSchema>;

export const createGoodsReceiptSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  lines: z.array(createGoodsReceiptLineSchema).min(1),
  receivedDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateGoodsReceiptDto = z.infer<typeof createGoodsReceiptSchema>;
