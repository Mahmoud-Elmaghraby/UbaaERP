import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * tenant_settings (CLAUDE.md §16.1 / master doc §16.1): a single settings
 * row per tenant. Currency is modeled as one field on this row (per the
 * approved Settings-plan resolution — currency is NOT a separate entity).
 *
 * Enforced as a true singleton at the DB level (not just by application
 * convention): `singleton` is always TRUE and carries a UNIQUE constraint,
 * so a second INSERT can never succeed. This is a plain-CRUD module
 * (master doc §4) — no DDD aggregate needed, but a real DB constraint
 * here is cheap and prevents a genuine bug class (duplicate settings rows).
 */
const migration: TenantMigration = {
  name: '0001_create_tenant_settings',
  async up(db) {
    await sql`
      CREATE TABLE tenant_settings (
        id UUID PRIMARY KEY,
        singleton BOOLEAN NOT NULL DEFAULT TRUE,
        currency_code TEXT NOT NULL DEFAULT 'EGP',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT tenant_settings_singleton_check CHECK (singleton = TRUE),
        CONSTRAINT tenant_settings_singleton_unique UNIQUE (singleton)
      )
    `.execute(db);
  },
};

export default migration;
