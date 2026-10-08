import { Money } from '@erp-platform/shared-kernel';
import type { Kysely, Selectable } from 'kysely';
import type { TreasuriesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { BankAccountRepository } from '../../application/ports/bank-account.repository';
import type { BankAccount, BankAccountFilters } from '../../domain/bank-account.entity';

/**
 * Since migration 0095 the Treasury module owns these rows (`treasuries`);
 * Accounting sees the ones linked to a chart account — those are the ones
 * that have a GL register to reconcile. Read-only here.
 */
function toDomain(row: Selectable<TreasuriesTable>): BankAccount {
  return {
    id: row.id,
    name: row.name,
    bankName: row.bank_name ?? '',
    accountNumber: row.account_number ?? '',
    iban: row.iban,
    currency: row.currency,
    chartOfAccountId: row.chart_of_account_id!,
    openingBalance: Money.fromMinorUnits(BigInt(row.opening_balance_amount), row.currency),
    openingBalanceDate: row.opening_balance_date,
    isActive: row.is_active,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyBankAccountRepository implements BankAccountRepository {
  async list(db: Kysely<TenantDatabase>, filters?: BankAccountFilters): Promise<BankAccount[]> {
    let query = db.selectFrom('treasuries').selectAll().where('chart_of_account_id', 'is not', null);
    if (filters?.isActive !== undefined) query = query.where('is_active', '=', filters.isActive);
    const rows = await query.orderBy('name').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<BankAccount | null> {
    const row = await db
      .selectFrom('treasuries')
      .selectAll()
      .where('id', '=', id)
      .where('chart_of_account_id', 'is not', null)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findByChartOfAccountId(db: Kysely<TenantDatabase>, chartOfAccountId: string): Promise<BankAccount | null> {
    const row = await db
      .selectFrom('treasuries')
      .selectAll()
      .where('chart_of_account_id', '=', chartOfAccountId)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
