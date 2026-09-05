import { z } from 'zod';

export const salesReturnStatusSchema = z.enum(['draft', 'confirmed', 'cancelled']);
export type SalesReturnStatusDto = z.infer<typeof salesReturnStatusSchema>;

export const salesReturnLineSchema = z.object({
  id: z.string().uuid(),
  salesReturnId: z.string().uuid(),
  deliveryLineId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantityReturned: z.number().positive(),
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type SalesReturnLineDto = z.infer<typeof salesReturnLineSchema>;

export const salesReturnSchema = z.object({
  id: z.string().uuid(),
  returnNumber: z.string().min(1),
  deliveryId: z.string().uuid(),
  status: salesReturnStatusSchema,
  returnDate: z.string().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type SalesReturnDto = z.infer<typeof salesReturnSchema>;

export const salesReturnWithLinesSchema = salesReturnSchema.extend({
  lines: z.array(salesReturnLineSchema),
});
export type SalesReturnWithLinesDto = z.infer<typeof salesReturnWithLinesSchema>;

/**
 * Confirm-action-only response shape — includes the auto-generated
 * sales credit note's id (see migration 0053). Not used by
 * list/getById/create, which return plain SalesReturnWithLinesDto.
 */
export const salesReturnConfirmationSchema = salesReturnWithLinesSchema.extend({
  creditNoteId: z.string().uuid(),
});
export type SalesReturnConfirmationDto = z.infer<typeof salesReturnConfirmationSchema>;

export const createSalesReturnLineSchema = z.object({
  deliveryLineId: z.string().uuid(),
  quantityReturned: z.number().positive(),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type CreateSalesReturnLineDto = z.infer<typeof createSalesReturnLineSchema>;

export const createSalesReturnSchema = z.object({
  deliveryId: z.string().uuid(),
  lines: z.array(createSalesReturnLineSchema).min(1),
  returnDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreateSalesReturnDto = z.infer<typeof createSalesReturnSchema>;
