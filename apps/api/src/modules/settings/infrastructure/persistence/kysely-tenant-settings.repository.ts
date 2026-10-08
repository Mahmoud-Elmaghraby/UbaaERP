import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Kysely, Selectable } from 'kysely';
import type { TenantDatabase, TenantSettingsTable } from '../../../../database/tenant/kysely-client';
import type { TenantSettingsRepository } from '../../application/ports/tenant-settings.repository';
import type { TenantSettings, UpdateTenantSettingsInput } from '../../domain/tenant-settings.entity';
import { isPostgresUniqueViolation } from '../../../../shared/errors/domain-errors';

function toDomain(row: Selectable<TenantSettingsTable>): TenantSettings {
  return {
    id: row.id,
    currencyCode: row.currency_code,
    companyName: row.company_name,
    address: row.address,
    taxRegistrationNumber: row.tax_registration_number,
    commercialRegister: row.commercial_register,
    phone: row.phone,
    email: row.email,
    website: row.website,
    logoObjectKey: row.logo_object_key,
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
    const hasChanges =
      input.currencyCode !== undefined ||
      input.companyName !== undefined ||
      input.address !== undefined ||
      input.taxRegistrationNumber !== undefined ||
      input.commercialRegister !== undefined ||
      input.phone !== undefined ||
      input.email !== undefined ||
      input.website !== undefined ||
      input.logoObjectKey !== undefined;
    if (!hasChanges) return settings;

    const updated = await db
      .updateTable('tenant_settings')
      .set({
        ...(input.currencyCode !== undefined ? { currency_code: input.currencyCode } : {}),
        ...(input.companyName !== undefined ? { company_name: input.companyName } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.taxRegistrationNumber !== undefined
          ? { tax_registration_number: input.taxRegistrationNumber }
          : {}),
        ...(input.commercialRegister !== undefined ? { commercial_register: input.commercialRegister } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.website !== undefined ? { website: input.website } : {}),
        ...(input.logoObjectKey !== undefined ? { logo_object_key: input.logoObjectKey } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', settings.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(updated);
  }
}
