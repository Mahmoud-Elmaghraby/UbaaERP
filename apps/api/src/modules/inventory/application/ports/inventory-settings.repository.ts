import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { InventorySettings, UpdateInventorySettingsInput } from '../../domain/inventory-settings.entity';

export interface InventorySettingsRepository {
  /** The singleton row (seeded by migration 0075). */
  get(db: Kysely<TenantDatabase>): Promise<InventorySettings>;
  update(db: Kysely<TenantDatabase>, input: UpdateInventorySettingsInput): Promise<InventorySettings>;
}

export const INVENTORY_SETTINGS_REPOSITORY = Symbol('INVENTORY_SETTINGS_REPOSITORY');
