import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

export const purchaseOrderStatusSchema = z.enum([
  'draft',
  'confirmed',
  'partially_received',
  'fully_received',
  'cancelled',
]);
export type PurchaseOrderStatusDto = z.infer<typeof purchaseOrderStatusSchema>;

export const purchaseOrderLineSchema = z.object({
  id: z.string().uuid(),
  purchaseOrderId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: moneySchema,
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type PurchaseOrderLineDto = z.infer<typeof purchaseOrderLineSchema>;

export const purchaseOrderSchema = z.object({
  id: z.string().uuid(),
  poNumber: z.string().min(1),
  supplierId: z.string().uuid(),
  sourceQuotationId: z.string().uuid().nullable(),
  status: purchaseOrderStatusSchema,
  expectedDeliveryDate: z.string().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type PurchaseOrderDto = z.infer<typeof purchaseOrderSchema>;

export const purchaseOrderWithLinesSchema = purchaseOrderSchema.extend({
  lines: z.array(purchaseOrderLineSchema),
  totalAmount: moneySchema,
});
export type PurchaseOrderWithLinesDto = z.infer<typeof purchaseOrderWithLinesSchema>;

export const createPurchaseOrderLineSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: moneySchema,
  notes: z.string().nullable().optional(),
});
export type CreatePurchaseOrderLineDto = z.infer<typeof createPurchaseOrderLineSchema>;

export const createPurchaseOrderSchema = z.object({
  sourceQuotationId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid().optional(),
  lines: z.array(createPurchaseOrderLineSchema).min(1).optional(),
  expectedDeliveryDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreatePurchaseOrderDto = z.infer<typeof createPurchaseOrderSchema>;

export const updatePurchaseOrderSchema = z.object({
  expectedDeliveryDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  lines: z.array(createPurchaseOrderLineSchema).min(1).optional(),
});
export type UpdatePurchaseOrderDto = z.infer<typeof updatePurchaseOrderSchema>;
