import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

export const posSessionStatusSchema = z.enum(['open', 'closed']);
export type PosSessionStatusDto = z.infer<typeof posSessionStatusSchema>;

export const posSessionSchema = z.object({
  id: z.string().uuid(),
  cashierUserId: z.string().uuid(),
  status: posSessionStatusSchema,
  openingCashAmount: moneySchema,
  expectedCashAmount: moneySchema.nullable(),
  countedCashAmount: moneySchema.nullable(),
  varianceAmount: moneySchema.nullable(),
  notes: z.string().nullable(),
  openedAt: z.coerce.date(),
  closedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type PosSessionDto = z.infer<typeof posSessionSchema>;

export const openPosSessionSchema = z.object({
  openingCashAmount: moneySchema,
  notes: z.string().nullable().optional(),
});
export type OpenPosSessionDto = z.infer<typeof openPosSessionSchema>;

export const closePosSessionSchema = z.object({
  countedCashAmount: moneySchema,
  notes: z.string().nullable().optional(),
});
export type ClosePosSessionDto = z.infer<typeof closePosSessionSchema>;
