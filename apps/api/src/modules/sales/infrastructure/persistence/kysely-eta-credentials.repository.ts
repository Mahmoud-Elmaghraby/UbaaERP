import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { EtaCredentialsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  EtaCredentialsRepository,
  UpdateEtaCredentialsRepositoryInput,
} from '../../application/ports/eta-credentials.repository';
import type { EtaCredentials, EtaEnvironment } from '../../domain/eta-credentials.entity';
import { isPostgresUniqueViolation } from '../../../../shared/errors/domain-errors';

function toDomain(row: Selectable<EtaCredentialsTable>): EtaCredentials {
  return {
    id: row.id,
    clientId: row.client_id,
    clientSecretConfigured: row.client_secret_encrypted !== null,
    taxRegistrationNumber: row.tax_registration_number,
    environment: row.environment as EtaEnvironment,
    documentVersion: row.document_version,
    isEnabled: row.is_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyEtaCredentialsRepository implements EtaCredentialsRepository {
  async getOrCreate(db: Kysely<TenantDatabase>): Promise<EtaCredentials> {
    const existing = await db.selectFrom('eta_credentials').selectAll().executeTakeFirst();
    if (existing) return toDomain(existing);

    try {
      const created = await db
        .insertInto('eta_credentials')
        .values({
          id: randomUUID(),
          singleton: true,
          client_id: null,
          client_secret_encrypted: null,
          tax_registration_number: null,
          environment: 'preprod',
          document_version: '0.9',
          is_enabled: false,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toDomain(created);
    } catch (err) {
      // Same benign race as KyselyTenantSettingsRepository.getOrCreate —
      // the singleton UNIQUE constraint (migration 0040) makes a second
      // concurrent INSERT fail; re-read instead of propagating.
      if (!isPostgresUniqueViolation(err)) throw err;
      const row = await db.selectFrom('eta_credentials').selectAll().executeTakeFirstOrThrow();
      return toDomain(row);
    }
  }

  async update(
    db: Kysely<TenantDatabase>,
    input: UpdateEtaCredentialsRepositoryInput,
  ): Promise<EtaCredentials> {
    const credentials = await this.getOrCreate(db);
    const updated = await db
      .updateTable('eta_credentials')
      .set({
        ...(input.clientId !== undefined ? { client_id: input.clientId } : {}),
        ...(input.clientSecretEncrypted !== undefined
          ? { client_secret_encrypted: input.clientSecretEncrypted }
          : {}),
        ...(input.taxRegistrationNumber !== undefined
          ? { tax_registration_number: input.taxRegistrationNumber }
          : {}),
        ...(input.environment !== undefined ? { environment: input.environment } : {}),
        ...(input.documentVersion !== undefined ? { document_version: input.documentVersion } : {}),
        ...(input.isEnabled !== undefined ? { is_enabled: input.isEnabled } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', credentials.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(updated);
  }

  async getEncryptedClientSecret(db: Kysely<TenantDatabase>): Promise<string | null> {
    const row = await db
      .selectFrom('eta_credentials')
      .select('client_secret_encrypted')
      .executeTakeFirst();
    return row?.client_secret_encrypted ?? null;
  }
}
