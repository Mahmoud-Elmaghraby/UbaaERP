import { z } from 'zod';

export const numberingSequenceSchema = z.object({
  id: z.string().uuid(),
  documentType: z.string().min(1),
  branchId: z.string().uuid().nullable(),
  prefix: z.string().nullable(),
  nextNumber: z.number().int().positive(),
  paddingLength: z.number().int().min(1).max(20),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type NumberingSequenceDto = z.infer<typeof numberingSequenceSchema>;

export const createNumberingSequenceSchema = z.object({
  documentType: z.string().min(1),
  branchId: z.string().uuid().nullable().optional(),
  prefix: z.string().nullable().optional(),
  nextNumber: z.number().int().positive().optional(),
  paddingLength: z.number().int().min(1).max(20).optional(),
});
export type CreateNumberingSequenceDto = z.infer<typeof createNumberingSequenceSchema>;

export const updateNumberingSequenceSchema = z.object({
  prefix: z.string().nullable().optional(),
  nextNumber: z.number().int().positive().optional(),
  paddingLength: z.number().int().min(1).max(20).optional(),
});
export type UpdateNumberingSequenceDto = z.infer<typeof updateNumberingSequenceSchema>;

export const allocatedDocumentNumberSchema = z.object({
  sequenceId: z.string().uuid(),
  number: z.number().int().positive(),
  formatted: z.string(),
});
export type AllocatedDocumentNumberDto = z.infer<typeof allocatedDocumentNumberSchema>;

export const allocateNextRequestSchema = z.object({
  documentType: z.string().min(1),
  branchId: z.string().uuid().nullable().optional(),
});
export type AllocateNextRequestDto = z.infer<typeof allocateNextRequestSchema>;
