import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Selectable } from 'kysely';
import type { ExchangeRatesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ExchangeRateRepository } from '../../application/ports/exchange-rate.repository';
import type {
  CreateExchangeRateInput,
  ExchangeRate,
  ExchangeRateFilters,
  ExchangeRateSource,
} from '../../domain/exchange-rate.entity';

function toDomain(row: Selectable<ExchangeRatesTable>): ExchangeRate {
  return {
    id: row.id,
    fromCurrency: row.from_currency,
    toCurrency: row.to_currency,
    rate: row.rate,
    rateDate: row.rate_date,
    source: row.source as ExchangeRateSource,
    createdAt: row.created_at,
  };
}

export class KyselyExchangeRateRepository implements ExchangeRateRepository {
  async list(db: Kysely<TenantDatabase>, filters?: ExchangeRateFilters): Promise<ExchangeRate[]> {
    let query = db.selectFrom('exchange_rates').selectAll();
    if (filters?.fromCurrency) query = query.where('from_currency', '=', filters.fromCurrency);
    if (filters?.toCurrency) query = query.where('to_currency', '=', filters.toCurrency);
    const rows = await query.orderBy('rate_date', 'desc').orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<ExchangeRate | null> {
    const row = await db.selectFrom('exchange_rates').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateExchangeRateInput): Promise<ExchangeRate> {
    const row = await db
      .insertInto('exchange_rates')
      .values({
        id: randomUUID(),
        from_currency: input.fromCurrency,
        to_currency: input.toCurrency,
        rate: input.rate,
        rate_date: input.rateDate,
        source: input.source ?? 'manual',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findEffectiveRate(
    db: Kysely<TenantDatabase>,
    fromCurrency: string,
    toCurrency: string,
    asOfDate: string,
  ): Promise<ExchangeRate | null> {
    const row = await db
      .selectFrom('exchange_rates')
      .selectAll()
      .where('from_currency', '=', fromCurrency)
      .where('to_currency', '=', toCurrency)
      .where('rate_date', '<=', asOfDate)
      // Most recent date first; a manual entry beats an api one on the same date.
      .orderBy('rate_date', 'desc')
      .orderBy(sql`(source = 'manual')`, 'desc')
      .limit(1)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
