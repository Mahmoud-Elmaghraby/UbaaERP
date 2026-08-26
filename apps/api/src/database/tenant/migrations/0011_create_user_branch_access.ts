import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * user_branch_access (master doc §16.2): which branches a user may
 * operate in. FKs to `branches`, owned by the Settings module's own
 * migrations (0002) — a same-schema DDL reference, not a code-level
 * import between modules, so this does not violate the Event-Bus-only
 * module decoupling rule (CLAUDE.md §2.6, which governs business-logic
 * calls, not database foreign keys within one tenant schema).
 */
const migration: TenantMigration = {
  name: '0011_create_user_branch_access',
  async up(db) {
    await sql`
      CREATE TABLE user_branch_access (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, branch_id)
      )
    `.execute(db);
  },
};

export default migration;
