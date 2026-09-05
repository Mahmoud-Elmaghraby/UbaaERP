import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Extends accounting_settings (migration 0052) with the three mappings
 * Stage 3 needs (CLAUDE.md §10 — step 5, Accounting): auto-posting from
 * Sales Invoice / Purchase Invoice posting (claude/accounting-module-
 * research.md's roadmap item 3 — "revenue/AR, expense/AP").
 * accounts_receivable_account_id already exists from Stage 6/7 and is
 * reused as-is for the sales-invoice debit side.
 *
 * - revenue_account_id — credit side of a posted Sales Invoice.
 * - accounts_payable_account_id — credit side of a posted Purchase Invoice.
 * - purchase_expense_account_id — debit side of a posted Purchase
 *   Invoice. Deliberately NOT auto-populated in the repository (unlike
 *   the other mappings) — the default chart-of-accounts template (see
 *   migration 0048) has no single generic "purchases expense" leaf
 *   account, only specific operating-expense categories under group
 *   '52' (salaries, rent, utilities, ...). Guessing one of those would
 *   be wrong for most tenants, so this mapping starts NULL and the
 *   auto-posting listener fails loudly (BusinessRuleError) until a
 *   tenant admin configures it via Accounting Settings — same
 *   "don't guess when a mapping is missing" discipline the other three
 *   mappings already follow once a tenant edits their chart of
 *   accounts.
 *
 * Same nullable-FK-with-ON-DELETE-SET-NULL shape as every other column
 * on this table.
 */
const migration: TenantMigration = {
  name: '0054_add_invoice_posting_accounts',
  async up(db) {
    await sql`
      ALTER TABLE accounting_settings
        ADD COLUMN revenue_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        ADD COLUMN accounts_payable_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        ADD COLUMN purchase_expense_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL
    `.execute(db);
  },
};

export default migration;
