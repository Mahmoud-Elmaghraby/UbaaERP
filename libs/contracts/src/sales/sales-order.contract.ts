import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

export const salesOrderStatusSchema = z.enum([
  'draft',
  'confirmed',
  'partially_delivered',
  'fully_delivered',
  'cancelled',
]);
export type SalesOrderStatusDto = z.infer<typeof salesOrderStatusSchema>;

export const salesOrderLineSchema = z.object({
  id: z.string().uuid(),
  salesOrderId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: moneySchema,
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type SalesOrderLineDto = z.infer<typeof salesOrderLineSchema>;

export const salesOrderSchema = z.object({
  id: z.string().uuid(),
  soNumber: z.string().min(1),
  customerId: z.string().uuid(),
  sourceQuotationId: z.string().uuid().nullable(),
  status: salesOrderStatusSchema,
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type SalesOrderDto = z.infer<typeof salesOrderSchema>;

export const salesOrderWithLinesSchema = salesOrderSchema.extend({
  lines: z.array(salesOrderLineSchema),
  totalAmount: moneySchema,
});
export type SalesOrderWithLinesDto = z.infer<typeof salesOrderWithLinesSchema>;

export const createSalesOrderLineSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: moneySchema,
  notes: z.string().nullable().optional(),
});
export type CreateSalesOrderLineDto = z.infer<typeof createSalesOrderLineSchema>;

export const createSalesOrderSchema = z.object({
  sourceQuotationId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().optional(),
  lines: z.array(createSalesOrderLineSchema).min(1).optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateSalesOrderDto = z.infer<typeof createSalesOrderSchema>;

export const updateSalesOrderSchema = z.object({
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  lines: z.array(createSalesOrderLineSchema).min(1).optional(),
});
export type UpdateSalesOrderDto = z.infer<typeof updateSalesOrderSchema>;
