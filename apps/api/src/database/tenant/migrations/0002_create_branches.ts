import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * branches (master doc §16.1): one of the entities every later module's
 * numbering/inventory/sales flows will reference. custom_fields is
 * mandatory on every major entity (CLAUDE.md §7) — meaningful once the
 * dynamic form engine (frontend, later) reads its schema and renders it.
 */
const migration: TenantMigration = {
  name: '0002_create_branches',
  async up(db) {
    await sql`
      CREATE TABLE branches (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        address TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT branches_code_unique UNIQUE (code)
      )
    `.execute(db);
  },
};

export default migration;
