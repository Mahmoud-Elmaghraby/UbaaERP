import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { AccountingPeriodsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { AccountingPeriodRepository } from '../../application/ports/accounting-period.repository';
import type {
  AccountingPeriod,
  AccountingPeriodStatus,
  CreateAccountingPeriodInput,
} from '../../domain/accounting-period.entity';

function toDomain(row: Selectable<AccountingPeriodsTable>): AccountingPeriod {
  return {
    id: row.id,
    fiscalYearId: row.fiscal_year_id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status as AccountingPeriodStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyAccountingPeriodRepository implements AccountingPeriodRepository {
  async list(db: Kysely<TenantDatabase>, fiscalYearId?: string): Promise<AccountingPeriod[]> {
    let query = db.selectFrom('accounting_periods').selectAll();
    if (fiscalYearId) query = query.where('fiscal_year_id', '=', fiscalYearId);
    const rows = await query.orderBy('start_date').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<AccountingPeriod | null> {
    const row = await db.selectFrom('accounting_periods').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findByFiscalYearId(db: Kysely<TenantDatabase>, fiscalYearId: string): Promise<AccountingPeriod[]> {
    const rows = await db
      .selectFrom('accounting_periods')
      .selectAll()
      .where('fiscal_year_id', '=', fiscalYearId)
      .orderBy('start_date')
      .execute();
    return rows.map(toDomain);
  }

  async findByDate(db: Kysely<TenantDatabase>, date: string): Promise<AccountingPeriod | null> {
    const row = await db
      .selectFrom('accounting_periods')
      .selectAll()
      .where('start_date', '<=', date)
      .where('end_date', '>=', date)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateAccountingPeriodInput): Promise<AccountingPeriod> {
    const row = await db
      .insertInto('accounting_periods')
      .values({
        id: randomUUID(),
        fiscal_year_id: input.fiscalYearId,
        name: input.name,
        start_date: input.startDate,
        end_date: input.endDate,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: AccountingPeriodStatus,
  ): Promise<AccountingPeriod | null> {
    const row = await db
      .updateTable('accounting_periods')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
