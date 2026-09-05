import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * warehouses (master doc §16.3): physical/logical stock locations.
 * custom_fields is mandatory on every major entity (CLAUDE.md §7).
 * Deliberately no FK to Settings' `branches` yet — the master document
 * does not specify a warehouse<->branch relationship, and inventing one
 * now would be an unrequested schema decision; a nullable branch_id can
 * be added later without breaking this table.
 */
const migration: TenantMigration = {
  name: '0016_create_warehouses',
  async up(db) {
    await sql`
      CREATE TABLE warehouses (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        address TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT warehouses_code_unique UNIQUE (code)
      )
    `.execute(db);
  },
};

export default migration;
