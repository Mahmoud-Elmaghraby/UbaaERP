import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

export const quotationStatusSchema = z.enum(['draft', 'sent', 'accepted', 'rejected', 'cancelled']);
export type QuotationStatusDto = z.infer<typeof quotationStatusSchema>;

export const quotationLineSchema = z.object({
  id: z.string().uuid(),
  quotationId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  unitOfMeasureId: z.string().uuid().nullable().default(null),
  unitFactor: z.number().positive().default(1),
  quantity: z.number().positive(),
  unitPrice: moneySchema,
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type QuotationLineDto = z.infer<typeof quotationLineSchema>;

export const quotationSchema = z.object({
  id: z.string().uuid(),
  quotationNumber: z.string().min(1),
  customerId: z.string().uuid(),
  status: quotationStatusSchema,
  validUntilDate: z.string().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type QuotationDto = z.infer<typeof quotationSchema>;

export const quotationWithLinesSchema = quotationSchema.extend({
  lines: z.array(quotationLineSchema),
  totalAmount: moneySchema,
});
export type QuotationWithLinesDto = z.infer<typeof quotationWithLinesSchema>;

export const createQuotationLineSchema = z.object({
  productVariantId: z.string().uuid(),
  /** Line unit (carton, sack…); omitted/null = the product's base unit. */
  unitOfMeasureId: z.string().uuid().nullable().optional(),
  quantity: z.number().positive(),
  unitPrice: moneySchema,
  notes: z.string().nullable().optional(),
});
export type CreateQuotationLineDto = z.infer<typeof createQuotationLineSchema>;

export const createQuotationSchema = z.object({
  customerId: z.string().uuid(),
  lines: z.array(createQuotationLineSchema).min(1),
  validUntilDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateQuotationDto = z.infer<typeof createQuotationSchema>;

export const updateQuotationSchema = z.object({
  validUntilDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  lines: z.array(createQuotationLineSchema).min(1).optional(),
});
export type UpdateQuotationDto = z.infer<typeof updateQuotationSchema>;
