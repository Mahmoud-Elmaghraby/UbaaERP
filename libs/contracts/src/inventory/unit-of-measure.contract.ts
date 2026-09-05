import { z } from 'zod';

export const unitOfMeasureSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  symbol: z.string().min(1),
  baseUnitId: z.string().uuid().nullable(),
  conversionFactor: z.number().positive(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type UnitOfMeasureDto = z.infer<typeof unitOfMeasureSchema>;

export const createUnitOfMeasureSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  baseUnitId: z.string().uuid().nullable().optional(),
  conversionFactor: z.number().positive().optional(),
  isActive: z.boolean().optional(),
});
export type CreateUnitOfMeasureDto = z.infer<typeof createUnitOfMeasureSchema>;

export const updateUnitOfMeasureSchema = createUnitOfMeasureSchema.partial();
export type UpdateUnitOfMeasureDto = z.infer<typeof updateUnitOfMeasureSchema>;

export const convertUnitOfMeasureSchema = z.object({
  fromUnitId: z.string().uuid(),
  toUnitId: z.string().uuid(),
  quantity: z.number().positive(),
});
export type ConvertUnitOfMeasureDto = z.infer<typeof convertUnitOfMeasureSchema>;

export const unitConversionResultSchema = z.object({
  quantity: z.number(),
});
export type UnitConversionResultDto = z.infer<typeof unitConversionResultSchema>;
