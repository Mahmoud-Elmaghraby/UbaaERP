import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * The tagging half of Stage 4 (see migration 0055's own comment): an
 * optional cost-center reference per journal entry line. Nullable —
 * tagging a line is never required, matching "a simple tagging
 * dimension" rather than a mandatory second dimension of the ledger.
 * ON DELETE SET NULL — deleting a cost center un-tags any line that
 * referenced it rather than blocking the delete or cascading data loss,
 * same discipline as every other optional FK in this module (see
 * migration 0052's own comment on accounting_settings' four mappings).
 */
const migration: TenantMigration = {
  name: '0056_add_cost_center_to_journal_entry_lines',
  async up(db) {
    await sql`
      ALTER TABLE journal_entry_lines
        ADD COLUMN cost_center_id UUID REFERENCES cost_centers (id) ON DELETE SET NULL
    `.execute(db);
  },
};

export default migration;
