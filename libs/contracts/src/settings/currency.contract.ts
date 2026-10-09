import { z } from 'zod';

export const currencySchema = z.object({
  code: z.string(),
  name: z.string(),
  symbol: z.string(),
  isActive: z.boolean(),
});
export type CurrencyDto = z.infer<typeof currencySchema>;

export const createCurrencySchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  name: z.string().trim().min(1).max(60),
  symbol: z.string().trim().min(1).max(8),
});
export type CreateCurrencyDto = z.infer<typeof createCurrencySchema>;

export const updateCurrencySchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    symbol: z.string().trim().min(1).max(8),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateCurrencyDto = z.infer<typeof updateCurrencySchema>;
