import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { AccountingSettings, UpdateAccountingSettingsInput } from '../../domain/accounting-settings.entity';

export interface AccountingSettingsRepository {
  /** Returns the singleton row, creating it (auto-populated from the default template's known codes) if it doesn't exist yet. */
  getOrCreate(db: Kysely<TenantDatabase>): Promise<AccountingSettings>;
  update(db: Kysely<TenantDatabase>, input: UpdateAccountingSettingsInput): Promise<AccountingSettings>;
}

export const ACCOUNTING_SETTINGS_REPOSITORY = Symbol('ACCOUNTING_SETTINGS_REPOSITORY');
