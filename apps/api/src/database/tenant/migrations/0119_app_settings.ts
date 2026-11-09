import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * The central settings store behind the settings hub: one row per option someone has changed
 * (key from APP_SETTINGS in libs/contracts, value as JSON). A missing row means "the default",
 * which is always today's behaviour — so this migration changes nothing on its own.
 */
const migration: TenantMigration = {
  name: '0119_app_settings',
  async up(db) {
    await sql`
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by UUID NULL
      )
    `.execute(db);
  },
};

export default migration;
