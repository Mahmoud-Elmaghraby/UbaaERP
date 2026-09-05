import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { ChartOfAccountsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ChartOfAccountRepository } from '../../application/ports/chart-of-account.repository';
import type {
  ChartOfAccount,
  ChartOfAccountFilters,
  CreateChartOfAccountInput,
  UpdateChartOfAccountInput,
} from '../../domain/chart-of-account.entity';

function toDomain(row: Selectable<ChartOfAccountsTable>): ChartOfAccount {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    accountType: row.account_type as ChartOfAccount['accountType'],
    normalBalance: row.normal_balance as ChartOfAccount['normalBalance'],
    parentId: row.parent_id,
    isGroup: row.is_group,
    isSystem: row.is_system,
    isActive: row.is_active,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyChartOfAccountRepository implements ChartOfAccountRepository {
  async list(db: Kysely<TenantDatabase>, filters?: ChartOfAccountFilters): Promise<ChartOfAccount[]> {
    let query = db.selectFrom('chart_of_accounts').selectAll();
    if (filters?.accountType) query = query.where('account_type', '=', filters.accountType);
    if (filters?.isActive !== undefined) query = query.where('is_active', '=', filters.isActive);
    const rows = await query.orderBy('code').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<ChartOfAccount | null> {
    const row = await db.selectFrom('chart_of_accounts').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findByCode(db: Kysely<TenantDatabase>, code: string): Promise<ChartOfAccount | null> {
    const row = await db.selectFrom('chart_of_accounts').selectAll().where('code', '=', code).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async listChildren(db: Kysely<TenantDatabase>, parentId: string): Promise<ChartOfAccount[]> {
    const rows = await db
      .selectFrom('chart_of_accounts')
      .selectAll()
      .where('parent_id', '=', parentId)
      .orderBy('code')
      .execute();
    return rows.map(toDomain);
  }

  async create(db: Kysely<TenantDatabase>, input: CreateChartOfAccountInput): Promise<ChartOfAccount> {
    const row = await db
      .insertInto('chart_of_accounts')
      .values({
        id: randomUUID(),
        code: input.code,
        name: input.name,
        account_type: input.accountType,
        normal_balance: input.normalBalance,
        parent_id: input.parentId ?? null,
        is_group: input.isGroup ?? false,
        is_system: false,
        notes: input.notes ?? null,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateChartOfAccountInput,
  ): Promise<ChartOfAccount | null> {
    const row = await db
      .updateTable('chart_of_accounts')
      .set({
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
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
    const result = await db.deleteFrom('chart_of_accounts').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
