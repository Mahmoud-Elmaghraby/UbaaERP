import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  TenantSettings,
  UpdateTenantSettingsInput,
} from '../../domain/tenant-settings.entity';

/**
 * Repository port (Clean Architecture §2.1): the application layer depends
 * on this interface, never on Kysely directly. Every method takes the
 * tenant-scoped Kysely client explicitly (see ../../../../shared/tenancy/) —
 * repositories hold no connection state of their own.
 */
export interface TenantSettingsRepository {
  /** Returns the singleton row, creating it with defaults if it doesn't exist yet. */
  getOrCreate(db: Kysely<TenantDatabase>): Promise<TenantSettings>;
  update(db: Kysely<TenantDatabase>, input: UpdateTenantSettingsInput): Promise<TenantSettings>;
}

export const TENANT_SETTINGS_REPOSITORY = Symbol('TENANT_SETTINGS_REPOSITORY');
