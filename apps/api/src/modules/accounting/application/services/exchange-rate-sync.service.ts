import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { EXCHANGE_RATE_REPOSITORY, type ExchangeRateRepository } from '../ports/exchange-rate.repository';
import { EXCHANGE_RATE_PROVIDER, type ExchangeRateProvider } from '../ports/exchange-rate-provider';
import type { ExchangeRate } from '../../domain/exchange-rate.entity';
import { BusinessRuleError, isPostgresUniqueViolation } from '../errors';

export type ExchangeRateSyncStatus = 'synced' | 'already_up_to_date' | 'unavailable';

export interface ExchangeRateSyncResult {
  fromCurrency: string;
  toCurrency: string;
  status: ExchangeRateSyncStatus;
  /** Present only when status === 'synced'. */
  rate?: ExchangeRate;
}

export interface ExchangeRateSyncPair {
  fromCurrency: string;
  toCurrency: string;
}

/**
 * Live-rate sync (claude/multi-currency-strategy.md §3.7/§6, Phase 2).
 * For each requested currency pair, asks the injected
 * ExchangeRateProvider for today's rate and writes it straight into
 * exchange_rates with source='api' — bypassing ExchangeRatesService's
 * own validation exactly as that service's header comment anticipated
 * back in Phase 1, since a provider response is already a well-formed
 * ISO pair and a positive decimal, not user input.
 *
 * Never throws for "the external API has no rate for this pair today" —
 * that is the normal, expected outcome for an unsupported currency or a
 * transient outage (ExchangeRateProvider.getLatestRate() returns null
 * for exactly that reason), and is reported back as status:
 * 'unavailable' so the caller can fall back to a manual entry via
 * ExchangeRatesController instead. It DOES throw (BusinessRuleError,
 * same EXCHANGE_RATE.SAME_CURRENCY code ExchangeRatesService uses) for a
 * pair that is simply invalid input — that is a caller mistake, not an
 * external-source problem, and should fail before any network call.
 *
 * Deliberately idempotent: running the sync twice in one day for the
 * same pair just returns status: 'already_up_to_date' the second time
 * (caught via the same exchange_rates_unique_quote constraint
 * ExchangeRatesService relies on) rather than erroring — there is no
 * scheduler wired up yet (no @nestjs/schedule dependency in this
 * project), so this is triggered on demand via
 * ExchangeRatesController's POST /exchange-rates/sync for now; nothing
 * here assumes it only ever runs once per day.
 */
@Injectable()
export class ExchangeRateSyncService {
  constructor(
    @Inject(EXCHANGE_RATE_REPOSITORY) private readonly rates: ExchangeRateRepository,
    @Inject(EXCHANGE_RATE_PROVIDER) private readonly provider: ExchangeRateProvider,
  ) {}

  async syncOne(db: Kysely<TenantDatabase>, fromCurrency: string, toCurrency: string): Promise<ExchangeRateSyncResult> {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    if (from === to) {
      throw new BusinessRuleError('A currency cannot have an exchange rate against itself.', {
        code: 'EXCHANGE_RATE.SAME_CURRENCY',
      });
    }

    const quote = await this.provider.getLatestRate(from, to);
    if (!quote) {
      return { fromCurrency: from, toCurrency: to, status: 'unavailable' };
    }

    try {
      const rate = await this.rates.create(db, {
        fromCurrency: from,
        toCurrency: to,
        rate: quote.rate,
        rateDate: quote.rateDate,
        source: 'api',
      });
      return { fromCurrency: from, toCurrency: to, status: 'synced', rate };
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        return { fromCurrency: from, toCurrency: to, status: 'already_up_to_date' };
      }
      throw err;
    }
  }

  async syncMany(db: Kysely<TenantDatabase>, pairs: ExchangeRateSyncPair[]): Promise<ExchangeRateSyncResult[]> {
    const results: ExchangeRateSyncResult[] = [];
    for (const pair of pairs) {
      results.push(await this.syncOne(db, pair.fromCurrency, pair.toCurrency));
    }
    return results;
  }
}
