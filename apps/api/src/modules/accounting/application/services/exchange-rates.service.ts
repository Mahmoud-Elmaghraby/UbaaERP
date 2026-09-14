import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { EXCHANGE_RATE_REPOSITORY, type ExchangeRateRepository } from '../ports/exchange-rate.repository';
import type { CreateExchangeRateInput, ExchangeRate, ExchangeRateFilters } from '../../domain/exchange-rate.entity';
import { BusinessRuleError, isPostgresUniqueViolation } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';

const ISO_CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

/**
 * Manual exchange-rate entry (claude/multi-currency-strategy.md, Phase
 * 1). Plain CRUD-minus-update-and-delete over exchange_rates — see
 * migration 0072's comment for why there's no update/delete: a
 * correction is always a new row. Phase 2's live-rate fetch job will
 * write 'api'-sourced rows directly through ExchangeRateRepository
 * without going through this service's validation (it always deals in
 * well-formed ISO codes and positive decimal strings from its own
 * source), so this service is really "the human-facing entry point"
 * rather than the only writer.
 */
@Injectable()
export class ExchangeRatesService {
  constructor(@Inject(EXCHANGE_RATE_REPOSITORY) private readonly repository: ExchangeRateRepository) {}

  list(db: Kysely<TenantDatabase>, filters?: ExchangeRateFilters): Promise<ExchangeRate[]> {
    return this.repository.list(db, filters);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<ExchangeRate> {
    const rate = await this.repository.findById(db, id);
    if (!rate) throw entityNotFound('EXCHANGE_RATE', id);
    return rate;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateExchangeRateInput): Promise<ExchangeRate> {
    const fromCurrency = input.fromCurrency.toUpperCase();
    const toCurrency = input.toCurrency.toUpperCase();

    if (!ISO_CURRENCY_CODE_PATTERN.test(fromCurrency) || !ISO_CURRENCY_CODE_PATTERN.test(toCurrency)) {
      throw new BusinessRuleError('Currency codes must be three uppercase ISO 4217 letters.', {
        code: 'EXCHANGE_RATE.INVALID_CURRENCY_CODE',
      });
    }
    if (fromCurrency === toCurrency) {
      throw new BusinessRuleError('A currency cannot have an exchange rate against itself.', {
        code: 'EXCHANGE_RATE.SAME_CURRENCY',
      });
    }
    if (!(Number(input.rate) > 0)) {
      throw new BusinessRuleError('The exchange rate must be a positive number.', {
        code: 'EXCHANGE_RATE.RATE_NOT_POSITIVE',
      });
    }

    try {
      return await this.repository.create(db, {
        ...input,
        fromCurrency,
        toCurrency,
        source: input.source ?? 'manual',
      });
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new BusinessRuleError(
          `A ${input.source ?? 'manual'} rate for ${fromCurrency} -> ${toCurrency} on ${input.rateDate} already exists.`,
          {
            code: 'EXCHANGE_RATE.DUPLICATE_FOR_DATE',
            params: { from: fromCurrency, to: toCurrency, date: input.rateDate },
          },
        );
      }
      throw err;
    }
  }
}
