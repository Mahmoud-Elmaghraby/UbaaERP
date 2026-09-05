import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

export const supplierQuotationStatusSchema = z.enum(['received', 'selected', 'rejected']);
export type SupplierQuotationStatusDto = z.infer<typeof supplierQuotationStatusSchema>;

export const supplierQuotationLineSchema = z.object({
  id: z.string().uuid(),
  quotationId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: moneySchema,
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type SupplierQuotationLineDto = z.infer<typeof supplierQuotationLineSchema>;

export const supplierQuotationSchema = z.object({
  id: z.string().uuid(),
  rfqId: z.string().uuid(),
  supplierId: z.string().uuid(),
  status: supplierQuotationStatusSchema,
  validUntil: z.string().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type SupplierQuotationDto = z.infer<typeof supplierQuotationSchema>;

export const supplierQuotationWithLinesSchema = supplierQuotationSchema.extend({
  lines: z.array(supplierQuotationLineSchema),
});
export type SupplierQuotationWithLinesDto = z.infer<typeof supplierQuotationWithLinesSchema>;

export const createSupplierQuotationLineSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: moneySchema,
  notes: z.string().nullable().optional(),
});
export type CreateSupplierQuotationLineDto = z.infer<typeof createSupplierQuotationLineSchema>;

export const createSupplierQuotationSchema = z.object({
  rfqId: z.string().uuid(),
  supplierId: z.string().uuid(),
  validUntil: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  lines: z.array(createSupplierQuotationLineSchema).min(1),
});
export type CreateSupplierQuotationDto = z.infer<typeof createSupplierQuotationSchema>;

export const updateSupplierQuotationSchema = z.object({
  validUntil: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  lines: z.array(createSupplierQuotationLineSchema).min(1).optional(),
});
export type UpdateSupplierQuotationDto = z.infer<typeof updateSupplierQuotationSchema>;
