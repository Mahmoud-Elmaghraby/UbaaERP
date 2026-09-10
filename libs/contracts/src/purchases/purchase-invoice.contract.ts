import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

export const purchaseInvoiceStatusSchema = z.enum(['draft', 'posted', 'cancelled']);
export type PurchaseInvoiceStatusDto = z.infer<typeof purchaseInvoiceStatusSchema>;

export const purchaseInvoiceLineSchema = z.object({
  id: z.string().uuid(),
  purchaseInvoiceId: z.string().uuid(),
  purchaseOrderLineId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantityInvoiced: z.number().positive(),
  unitPrice: moneySchema,
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type PurchaseInvoiceLineDto = z.infer<typeof purchaseInvoiceLineSchema>;

export const purchaseInvoiceSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  supplierInvoiceNumber: z.string().nullable(),
  purchaseOrderId: z.string().uuid(),
  status: purchaseInvoiceStatusSchema,
  invoiceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type PurchaseInvoiceDto = z.infer<typeof purchaseInvoiceSchema>;

export const purchaseInvoiceWithLinesSchema = purchaseInvoiceSchema.extend({
  lines: z.array(purchaseInvoiceLineSchema),
  totalAmount: moneySchema,
});
export type PurchaseInvoiceWithLinesDto = z.infer<typeof purchaseInvoiceWithLinesSchema>;

export const createPurchaseInvoiceLineSchema = z.object({
  purchaseOrderLineId: z.string().uuid(),
  quantityInvoiced: z.number().positive(),
  unitPrice: moneySchema.optional(),
  notes: z.string().nullable().optional(),
});
export type CreatePurchaseInvoiceLineDto = z.infer<typeof createPurchaseInvoiceLineSchema>;

export const createPurchaseInvoiceDirectLineSchema = z.object({
  productVariantId: z.string().uuid(),
  quantityInvoiced: z.number().positive(),
  unitPrice: moneySchema,
  notes: z.string().nullable().optional(),
});
export type CreatePurchaseInvoiceDirectLineDto = z.infer<typeof createPurchaseInvoiceDirectLineSchema>;

/** Provide (purchaseOrderId + lines) OR (supplierId + directLines) — see PurchaseInvoicesService.create(). */
export const createPurchaseInvoiceSchema = z.object({
  purchaseOrderId: z.string().uuid().optional(),
  lines: z.array(createPurchaseInvoiceLineSchema).min(1).optional(),
  supplierId: z.string().uuid().optional(),
  directLines: z.array(createPurchaseInvoiceDirectLineSchema).min(1).optional(),
  warehouseId: z.string().uuid().optional(),
  supplierInvoiceNumber: z.string().nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreatePurchaseInvoiceDto = z.infer<typeof createPurchaseInvoiceSchema>;
