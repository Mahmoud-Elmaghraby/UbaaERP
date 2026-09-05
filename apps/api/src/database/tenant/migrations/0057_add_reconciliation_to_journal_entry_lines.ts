import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Bank reconciliation status (CLAUDE.md §10 — step 5, Accounting, Stage
 * 5 — claude/accounting-module-research.md's roadmap item 5: "basic
 * reconciliation status, not full statement-import reconciliation").
 *
 * Lives on journal_entry_lines rather than a separate table, same
 * reasoning as cost_center_id (migration 0056): reconciliation is a
 * per-line fact about an existing posted ledger line, not a new
 * document type. is_reconciled/reconciled_at are meaningful only for
 * lines posted to an account a bank_accounts row links to
 * (BankAccountsService is what scopes reads/writes to those lines) —
 * every other line simply carries is_reconciled = FALSE forever, which
 * is harmless and requires no extra nullability handling.
 */
const migration: TenantMigration = {
  name: '0057_add_reconciliation_to_journal_entry_lines',
  async up(db) {
    await sql`
      ALTER TABLE journal_entry_lines
        ADD COLUMN is_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN reconciled_at TIMESTAMPTZ
    `.execute(db);
  },
};

export default migration;
