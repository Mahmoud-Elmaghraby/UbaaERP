import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

export const salesInvoiceStatusSchema = z.enum(['draft', 'posted', 'cancelled']);
export type SalesInvoiceStatusDto = z.infer<typeof salesInvoiceStatusSchema>;

export const salesInvoiceLineSchema = z.object({
  id: z.string().uuid(),
  salesInvoiceId: z.string().uuid(),
  salesOrderLineId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantityInvoiced: z.number().positive(),
  unitPrice: moneySchema,
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type SalesInvoiceLineDto = z.infer<typeof salesInvoiceLineSchema>;

export const salesInvoiceSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  salesOrderId: z.string().uuid(),
  status: salesInvoiceStatusSchema,
  invoiceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type SalesInvoiceDto = z.infer<typeof salesInvoiceSchema>;

export const salesInvoiceWithLinesSchema = salesInvoiceSchema.extend({
  lines: z.array(salesInvoiceLineSchema),
  totalAmount: moneySchema,
});
export type SalesInvoiceWithLinesDto = z.infer<typeof salesInvoiceWithLinesSchema>;

export const createSalesInvoiceLineSchema = z.object({
  salesOrderLineId: z.string().uuid(),
  quantityInvoiced: z.number().positive(),
  unitPrice: moneySchema.optional(),
  notes: z.string().nullable().optional(),
});
export type CreateSalesInvoiceLineDto = z.infer<typeof createSalesInvoiceLineSchema>;

export const createSalesInvoiceSchema = z.object({
  salesOrderId: z.string().uuid(),
  lines: z.array(createSalesInvoiceLineSchema).min(1),
  invoiceDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateSalesInvoiceDto = z.infer<typeof createSalesInvoiceSchema>;
