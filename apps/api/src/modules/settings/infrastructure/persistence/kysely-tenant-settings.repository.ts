import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { TenantDatabase, TenantSettingsTable } from '../../../../database/tenant/kysely-client';
import type { TenantSettingsRepository } from '../../application/ports/tenant-settings.repository';
import type { TenantSettings, UpdateTenantSettingsInput } from '../../domain/tenant-settings.entity';
import { isPostgresUniqueViolation } from '../../../../shared/errors/domain-errors';

function toDomain(row: Selectable<TenantSettingsTable>): TenantSettings {
  return {
    id: row.id,
    currencyCode: row.currency_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyTenantSettingsRepository implements TenantSettingsRepository {
  async getOrCreate(db: Kysely<TenantDatabase>): Promise<TenantSettings> {
    const existing = await db.selectFrom('tenant_settings').selectAll().executeTakeFirst();
    if (existing) return toDomain(existing);

    try {
      const created = await db
        .insertInto('tenant_settings')
        .values({ id: randomUUID(), singleton: true, currency_code: 'EGP' })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toDomain(created);
    } catch (err) {
      // Two concurrent getOrCreate calls can both find no row and both try
      // to insert; the UNIQUE(singleton) constraint (migration 0001) makes
      // the second INSERT fail — that's expected, not an error: re-read the
      // row the other caller just created instead of propagating.
      if (!isPostgresUniqueViolation(err)) throw err;
      const row = await db.selectFrom('tenant_settings').selectAll().executeTakeFirstOrThrow();
      return toDomain(row);
    }
  }

  async update(db: Kysely<TenantDatabase>, input: UpdateTenantSettingsInput): Promise<TenantSettings> {
    const settings = await this.getOrCreate(db);
    if (input.currencyCode === undefined) return settings;

    const updated = await db
      .updateTable('tenant_settings')
      .set({ currency_code: input.currencyCode, updated_at: new Date() })
      .where('id', '=', settings.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(updated);
  }
}
