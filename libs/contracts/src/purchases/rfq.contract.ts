import { z } from 'zod';

export const rfqStatusSchema = z.enum(['draft', 'sent', 'closed', 'cancelled']);
export type RfqStatusDto = z.infer<typeof rfqStatusSchema>;

export const rfqLineSchema = z.object({
  id: z.string().uuid(),
  rfqId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type RfqLineDto = z.infer<typeof rfqLineSchema>;

export const rfqSchema = z.object({
  id: z.string().uuid(),
  rfqNumber: z.string().min(1),
  sourceRequisitionId: z.string().uuid().nullable(),
  status: rfqStatusSchema,
  notes: z.string().nullable(),
  customFields: z.record(z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type RfqDto = z.infer<typeof rfqSchema>;

export const rfqWithDetailsSchema = rfqSchema.extend({
  lines: z.array(rfqLineSchema),
  supplierIds: z.array(z.string().uuid()),
});
export type RfqWithDetailsDto = z.infer<typeof rfqWithDetailsSchema>;

export const createRfqLineSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  notes: z.string().nullable().optional(),
});
export type CreateRfqLineDto = z.infer<typeof createRfqLineSchema>;

export const createRfqSchema = z.object({
  sourceRequisitionId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  lines: z.array(createRfqLineSchema).min(1),
  supplierIds: z.array(z.string().uuid()).min(1),
});
export type CreateRfqDto = z.infer<typeof createRfqSchema>;

export const updateRfqSchema = z.object({
  notes: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  lines: z.array(createRfqLineSchema).min(1).optional(),
  supplierIds: z.array(z.string().uuid()).min(1).optional(),
});
export type UpdateRfqDto = z.infer<typeof updateRfqSchema>;
