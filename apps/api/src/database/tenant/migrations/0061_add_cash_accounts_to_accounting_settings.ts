import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Extends accounting_settings (migration 0052) with the two mappings
 * the POS feature's Stage 1 needs (CLAUDE.md §10 — step 4, Sales — POS;
 * see claude/sales-pos-research.md's "Cash Over/Short" section):
 *
 * - cash_account_id — the GL account representing cash-on-hand/the
 *   register drawer. Auto-populated from the default template's known
 *   code '111' ("النقدية بالصندوق"), same treatment as the four
 *   original Stage 6/7 mappings (see migration 0052's comment).
 * - cash_over_short_account_id — where a closed session's counted-vs-
 *   expected variance posts. Deliberately NOT auto-populated — same
 *   reasoning as purchase_expense_account_id (migration 0054's
 *   comment): the default chart-of-accounts template has no generic
 *   "cash over/short" leaf account, so this starts NULL and
 *   AccountingAutoPostingListeners.handlePosSessionClosed() fails
 *   loudly (BusinessRuleError) until a tenant admin configures it via
 *   Accounting Settings.
 *
 * Same nullable-FK-with-ON-DELETE-SET-NULL shape as every other column
 * on this table.
 */
const migration: TenantMigration = {
  name: '0061_add_cash_accounts_to_accounting_settings',
  async up(db) {
    await sql`
      ALTER TABLE accounting_settings
        ADD COLUMN cash_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        ADD COLUMN cash_over_short_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL
    `.execute(db);
  },
};

export default migration;
