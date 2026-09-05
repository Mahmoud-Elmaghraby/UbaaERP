import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Cost Centers (CLAUDE.md §10 — step 5, Accounting, Stage 4 —
 * claude/accounting-module-research.md's roadmap item 4). "A simple
 * tagging dimension on journal lines" — a flat list, deliberately NOT a
 * tree like chart_of_accounts (no parent_id, no is_group/is_system):
 * cost centers are cross-cutting labels ("Sales Department", "Cairo
 * Branch"), not a hierarchical structure that needs folder/leaf
 * semantics the way postable accounts do.
 *
 * No new permission — reuses 'accounting.manage' from migration 0048,
 * same as every other Accounting entity so far.
 */
const migration: TenantMigration = {
  name: '0055_create_cost_centers',
  async up(db) {
    await sql`
      CREATE TABLE cost_centers (
        id UUID PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT cost_centers_code_unique UNIQUE (code)
      )
    `.execute(db);
  },
};

export default migration;
