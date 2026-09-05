import { z } from 'zod';

export const purchaseReturnStatusSchema = z.enum(['draft', 'confirmed', 'cancelled']);
export type PurchaseReturnStatusDto = z.infer<typeof purchaseReturnStatusSchema>;

export const purchaseReturnLineSchema = z.object({
  id: z.string().uuid(),
  purchaseReturnId: z.string().uuid(),
  goodsReceiptLineId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantityReturned: z.number().positive(),
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type PurchaseReturnLineDto = z.infer<typeof purchaseReturnLineSchema>;

export const purchaseReturnSchema = z.object({
  id: z.string().uuid(),
  returnNumber: z.string().min(1),
  goodsReceiptId: z.string().uuid(),
  status: purchaseReturnStatusSchema,
  returnDate: z.string().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type PurchaseReturnDto = z.infer<typeof purchaseReturnSchema>;

export const purchaseReturnWithLinesSchema = purchaseReturnSchema.extend({
  lines: z.array(purchaseReturnLineSchema),
});
export type PurchaseReturnWithLinesDto = z.infer<typeof purchaseReturnWithLinesSchema>;

export const createPurchaseReturnLineSchema = z.object({
  goodsReceiptLineId: z.string().uuid(),
  quantityReturned: z.number().positive(),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type CreatePurchaseReturnLineDto = z.infer<typeof createPurchaseReturnLineSchema>;

export const createPurchaseReturnSchema = z.object({
  goodsReceiptId: z.string().uuid(),
  lines: z.array(createPurchaseReturnLineSchema).min(1),
  returnDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreatePurchaseReturnDto = z.infer<typeof createPurchaseReturnSchema>;
