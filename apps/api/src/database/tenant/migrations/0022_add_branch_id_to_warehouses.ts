import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Optional link from Inventory's warehouses to Settings' branches.
 * Cross-module DB foreign key, not a code import — same precedent as
 * Users & Permissions' user_branch_access -> branches FK (CLAUDE.md §2.6:
 * module decoupling is about not importing another business module's
 * code to trigger behavior; a DB-level reference between two entities
 * that plainly relate to each other is not that).
 */
const migration: TenantMigration = {
  name: '0022_add_branch_id_to_warehouses',
  async up(db) {
    await sql`ALTER TABLE warehouses ADD COLUMN branch_id UUID REFERENCES branches (id)`.execute(db);
    await sql`CREATE INDEX warehouses_branch_id_idx ON warehouses (branch_id)`.execute(db);
  },
};

export default migration;
