import { randomUUID } from 'node:crypto';
import { Money } from '@erp-platform/shared-kernel';
import type { Kysely, Selectable } from 'kysely';
import type { BankAccountsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { BankAccountRepository } from '../../application/ports/bank-account.repository';
import type {
  BankAccount,
  BankAccountFilters,
  CreateBankAccountInput,
  UpdateBankAccountInput,
} from '../../domain/bank-account.entity';

function toDomain(row: Selectable<BankAccountsTable>): BankAccount {
  return {
    id: row.id,
    name: row.name,
    bankName: row.bank_name,
    accountNumber: row.account_number,
    iban: row.iban,
    currency: row.currency,
    chartOfAccountId: row.chart_of_account_id,
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
    let query = db.selectFrom('bank_accounts').selectAll();
    if (filters?.isActive !== undefined) query = query.where('is_active', '=', filters.isActive);
    const rows = await query.orderBy('name').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<BankAccount | null> {
    const row = await db.selectFrom('bank_accounts').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findByChartOfAccountId(db: Kysely<TenantDatabase>, chartOfAccountId: string): Promise<BankAccount | null> {
    const row = await db
      .selectFrom('bank_accounts')
      .selectAll()
      .where('chart_of_account_id', '=', chartOfAccountId)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateBankAccountInput): Promise<BankAccount> {
    const row = await db
      .insertInto('bank_accounts')
      .values({
        id: randomUUID(),
        name: input.name,
        bank_name: input.bankName,
        account_number: input.accountNumber,
        iban: input.iban ?? null,
        currency: input.currency,
        chart_of_account_id: input.chartOfAccountId,
        opening_balance_amount: input.openingBalanceMinorUnits ?? '0',
        opening_balance_date: input.openingBalanceDate ?? null,
        notes: input.notes ?? null,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateBankAccountInput): Promise<BankAccount | null> {
    const row = await db
      .updateTable('bank_accounts')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.bankName !== undefined ? { bank_name: input.bankName } : {}),
        ...(input.accountNumber !== undefined ? { account_number: input.accountNumber } : {}),
        ...(input.iban !== undefined ? { iban: input.iban } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.customFields !== undefined ? { custom_fields: JSON.stringify(input.customFields) } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('bank_accounts').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
