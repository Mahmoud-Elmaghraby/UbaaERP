import { Injectable } from '@nestjs/common';
import type { Kysely, Selectable } from 'kysely';
import type { CreateCurrencyDto, CurrencyDto, UpdateCurrencyDto } from '@erp-platform/contracts';
import type { CurrenciesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import { BusinessRuleError, isPostgresUniqueViolation } from '../../../../shared/errors/domain-errors';
import { duplicateEntity, entityNotFound } from '../../../../shared/errors/entity-errors';

/** Settings › Currencies — the list every currency picker reads (plain CRUD). */
@Injectable()
export class CurrenciesService {
  async list(db: Kysely<TenantDatabase>): Promise<CurrencyDto[]> {
    const rows = await db.selectFrom('currencies').selectAll().orderBy('is_active', 'desc').orderBy('code').execute();
    return rows.map(toDto);
  }

  async create(db: Kysely<TenantDatabase>, input: CreateCurrencyDto): Promise<CurrencyDto> {
    try {
      const row = await db
        .insertInto('currencies')
        .values({ code: input.code, name: input.name, symbol: input.symbol })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toDto(row);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('CURRENCY', 'code', input.code);
      throw err;
    }
  }

  async update(db: Kysely<TenantDatabase>, code: string, input: UpdateCurrencyDto): Promise<CurrencyDto> {
    if (input.isActive === false) {
      const settings = await db.selectFrom('tenant_settings').select('currency_code').executeTakeFirst();
      if (settings?.currency_code === code) {
        throw new BusinessRuleError('The company currency cannot be deactivated.', { code: 'CURRENCY.COMPANY_CURRENCY' });
      }
    }
    const row = await db
      .updateTable('currencies')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        updated_at: new Date(),
      })
      .where('code', '=', code)
      .returningAll()
      .executeTakeFirst();
    if (!row) throw entityNotFound('CURRENCY', code);
    return toDto(row);
  }

  /** For services that accept a currency code: it must be a known, active currency. */
  async assertUsable(db: Kysely<TenantDatabase>, code: string): Promise<void> {
    const row = await db.selectFrom('currencies').select('is_active').where('code', '=', code).executeTakeFirst();
    if (!row?.is_active) {
      throw new BusinessRuleError(`Currency "${code}" is not an active currency.`, { code: 'CURRENCY.NOT_USABLE', params: { code } });
    }
  }
}

function toDto(row: Selectable<CurrenciesTable>): CurrencyDto {
  return { code: row.code, name: row.name, symbol: row.symbol, isActive: row.is_active };
}
