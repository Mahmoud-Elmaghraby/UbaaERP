import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { CreateExchangeRateInput, ExchangeRate, ExchangeRateFilters } from '../../domain/exchange-rate.entity';

export interface ExchangeRateRepository {
  list(db: Kysely<TenantDatabase>, filters?: ExchangeRateFilters): Promise<ExchangeRate[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<ExchangeRate | null>;
  create(db: Kysely<TenantDatabase>, input: CreateExchangeRateInput): Promise<ExchangeRate>;
  /**
   * The rate CurrencyConversionService should actually use to convert
   * fromCurrency -> toCurrency on asOfDate: the most recent row with
   * rate_date <= asOfDate, preferring source='manual' over 'api' when
   * both exist for that same rate_date (see migration 0072's comment).
   * Returns null when no rate has ever been recorded for this pair on or
   * before asOfDate.
   */
  findEffectiveRate(
    db: Kysely<TenantDatabase>,
    fromCurrency: string,
    toCurrency: string,
    asOfDate: string,
  ): Promise<ExchangeRate | null>;
}

export const EXCHANGE_RATE_REPOSITORY = Symbol('EXCHANGE_RATE_REPOSITORY');
