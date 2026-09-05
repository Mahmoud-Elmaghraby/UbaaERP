import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { EtaCredentials, EtaEnvironment } from '../../domain/eta-credentials.entity';

/**
 * Repository-level update shape mirrors UpdateEtaCredentialsInput
 * (domain) except `clientSecret` (plaintext) becomes
 * `clientSecretEncrypted` (already encrypted) — EtaCredentialsService is
 * the only layer that ever handles the plaintext secret; nothing below
 * it (repository, DB row) ever sees or stores it unencrypted.
 */
export interface UpdateEtaCredentialsRepositoryInput {
  clientId?: string | null;
  clientSecretEncrypted?: string | null;
  taxRegistrationNumber?: string | null;
  environment?: EtaEnvironment;
  documentVersion?: string;
  isEnabled?: boolean;
}

export interface EtaCredentialsRepository {
  /** Returns the singleton row, creating it with defaults if it doesn't exist yet. */
  getOrCreate(db: Kysely<TenantDatabase>): Promise<EtaCredentials>;
  update(db: Kysely<TenantDatabase>, input: UpdateEtaCredentialsRepositoryInput): Promise<EtaCredentials>;
  /** Internal-only accessor for the raw encrypted secret column — never exposed through EtaCredentials/the contract. Used by EtaCredentialsService.getDecryptedClientSecret(), which future e-invoice submission code will call. */
  getEncryptedClientSecret(db: Kysely<TenantDatabase>): Promise<string | null>;
}

export const ETA_CREDENTIALS_REPOSITORY = Symbol('ETA_CREDENTIALS_REPOSITORY');
