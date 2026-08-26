import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * approval_chains (master doc §16.2, §15.1): the MVP's simple linear
 * version only — one row per user pointing at their direct manager
 * (employee -> manager -> done). Kept as its own table (rather than a
 * manager_id column on users) so the later "composite chains" design
 * session (delegation, amount-based conditions, multi-step) can extend
 * this table without reshaping `users` — matching the master doc's own
 * phrasing that the base schema shouldn't need radical changes later.
 */
const migration: TenantMigration = {
  name: '0012_create_approval_chains',
  async up(db) {
    await sql`
      CREATE TABLE approval_chains (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT approval_chains_user_unique UNIQUE (user_id),
        CONSTRAINT approval_chains_no_self_manager CHECK (manager_id IS NULL OR manager_id <> user_id)
      )
    `.execute(db);
  },
};

export default migration;
