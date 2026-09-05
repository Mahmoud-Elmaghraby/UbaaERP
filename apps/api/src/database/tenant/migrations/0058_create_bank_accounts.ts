import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Bank Accounts (CLAUDE.md §10 — step 5, Accounting, Stage 5 —
 * claude/accounting-module-research.md's roadmap item 5: "entity +
 * linking journal entries to bank movements; basic reconciliation
 * status, not full statement-import reconciliation").
 *
 * Each bank account links to exactly one chart_of_accounts leaf
 * (chart_of_account_id, NOT NULL — a bank account with no GL account
 * behind it can't do anything: BankAccountsService.getRegister() reads
 * that account's own posted journal_entry_lines directly). ON DELETE
 * RESTRICT (the column's implicit default with no ON DELETE clause) —
 * unlike accounting_settings' optional mappings (ON DELETE SET NULL,
 * see migration 0052/0054), this FK is load-bearing for the row's own
 * meaning, so a tenant must repoint or delete the bank account first,
 * never silently orphan it.
 *
 * UNIQUE(chart_of_account_id) — one bank account per GL account. Two
 * bank accounts sharing one GL account would make "this line's
 * reconciliation status" ambiguous (which bank register does it belong
 * to?), so this is a hard constraint, not just a UI nicety.
 *
 * opening_balance_amount/opening_balance_date are a real business fact
 * (the account's balance at the point this system started tracking it),
 * not a derived value — everything after that date is derived by
 * summing posted journal_entry_lines against chart_of_account_id, same
 * "never store a derivable balance" discipline as the rest of this
 * module (see claude/accounting-module-research.md's terminology map).
 * currency is stored on the bank account itself (not inherited from
 * chart_of_account_id, which has none) — informational display only in
 * this pass; no FX conversion exists anywhere in the platform yet, same
 * caveat as journal_entries.currency.
 */
const migration: TenantMigration = {
  name: '0058_create_bank_accounts',
  async up(db) {
    await sql`
      CREATE TABLE bank_accounts (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        account_number TEXT NOT NULL,
        iban TEXT,
        currency TEXT NOT NULL,
        chart_of_account_id UUID NOT NULL REFERENCES chart_of_accounts (id),
        opening_balance_amount BIGINT NOT NULL DEFAULT 0,
        opening_balance_date DATE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT bank_accounts_chart_of_account_unique UNIQUE (chart_of_account_id)
      )
    `.execute(db);
  },
};

export default migration;
