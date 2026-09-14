import { z } from 'zod';

/**
 * Exchange rate (claude/multi-currency-strategy.md, Phase 1). See
 * exchange-rate.entity.ts for why there is no update/delete schema:
 * a correction is always a new row, never an edit of an old one.
 */
const isoCurrencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Must be a three-letter ISO 4217 currency code');

export const exchangeRateSchema = z.object({
  id: z.string().uuid(),
  fromCurrency: isoCurrencyCode,
  toCurrency: isoCurrencyCode,
  rate: z.string(),
  rateDate: z.string(),
  source: z.enum(['manual', 'api']),
  createdAt: z.coerce.date(),
});
export type ExchangeRateDto = z.infer<typeof exchangeRateSchema>;

export const createExchangeRateSchema = z.object({
  fromCurrency: isoCurrencyCode,
  toCurrency: isoCurrencyCode,
  rate: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal string'),
  rateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)'),
});
export type CreateExchangeRateDto = z.infer<typeof createExchangeRateSchema>;

/**
 * Live-rate sync (claude/multi-currency-strategy.md §3.7/§6, Phase 2).
 * fromCurrencies is the set of foreign currencies to fetch a fresh rate
 * for; the target is always the tenant's own base currency
 * (tenant_settings.currencyCode) — ExchangeRatesController resolves that
 * server-side via TenantSettingsService, never from client input, same
 * "server-determined currency" rule journal-entry.entity.ts documents
 * for JournalEntry.currency.
 */
export const syncExchangeRatesSchema = z.object({
  fromCurrencies: z.array(isoCurrencyCode).min(1, 'At least one currency is required').max(20),
});
export type SyncExchangeRatesDto = z.infer<typeof syncExchangeRatesSchema>;

export const exchangeRateSyncResultSchema = z.object({
  fromCurrency: isoCurrencyCode,
  toCurrency: isoCurrencyCode,
  status: z.enum(['synced', 'already_up_to_date', 'unavailable']),
  /** Present only when status === 'synced'. */
  rate: exchangeRateSchema.optional(),
});
export type ExchangeRateSyncResultDto = z.infer<typeof exchangeRateSyncResultSchema>;
