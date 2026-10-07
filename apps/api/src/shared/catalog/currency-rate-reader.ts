import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';

/**
 * Read-only lookups for valuing a foreign-currency document in the
 * tenant's own currency: the tenant currency (tenant_settings) and the
 * effective exchange rate on a date (exchange_rates — the most recent quote
 * on or before it, a manual quote beating an api one on the same day; the
 * same rule as Accounting's ExchangeRateRepository.findEffectiveRate()).
 *
 * A plain read of reference data, like the other shared/catalog helpers —
 * it triggers no behavior in another module (CLAUDE.md §2.6).
 */
@Injectable()
export class CurrencyRateReader {
  async tenantCurrency(db: Kysely<TenantDatabase>): Promise<string> {
    const row = await db.selectFrom('tenant_settings').select('currency_code').limit(1).executeTakeFirst();
    return row?.currency_code ?? 'EGP';
  }

  /** Units of `toCurrency` per 1 `fromCurrency` as a decimal string, or null when no quote exists. */
  async effectiveRate(
    db: Kysely<TenantDatabase>,
    fromCurrency: string,
    toCurrency: string,
    asOfDate: string,
  ): Promise<string | null> {
    const row = await db
      .selectFrom('exchange_rates')
      .select('rate')
      .where('from_currency', '=', fromCurrency)
      .where('to_currency', '=', toCurrency)
      .where('rate_date', '<=', asOfDate)
      .orderBy('rate_date', 'desc')
      .orderBy(sql`(source = 'manual')`, 'desc')
      .limit(1)
      .executeTakeFirst();
    return row ? normalizeRate(String(row.rate)) : null;
  }
}

/** "50.25000000" → "50.25"; "48" stays "48". */
export function normalizeRate(rate: string): string {
  return rate.includes('.') ? rate.replace(/0+$/, '').replace(/\.$/, '') : rate;
}

/**
 * minorUnits × rate with exact BigInt fixed-point arithmetic, rounded half
 * away from zero — no float ever enters a money calculation (CLAUDE.md §2.5).
 */
export function applyRate(minorUnits: bigint, rate: string): bigint {
  const negative = minorUnits < 0n;
  const abs = negative ? -minorUnits : minorUnits;
  const [whole, fraction = ''] = rate.trim().split('.');
  const divisor = 10n ** BigInt(fraction.length);
  const rounded = (abs * BigInt(`${whole}${fraction}`) + divisor / 2n) / divisor;
  return negative ? -rounded : rounded;
}
