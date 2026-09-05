import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * journal_entries + journal_entry_lines (CLAUDE.md §10/§16.6 — step 5,
 * Accounting, Stage 2). The actual double-entry ledger — every prior
 * Stage-1 table (chart_of_accounts, fiscal_years, accounting_periods)
 * exists to support this one.
 *
 * Money: debit_amount/credit_amount are BIGINT minor units, exactly the
 * same split as every other monetary column in this codebase (e.g.
 * purchase_order_lines.unit_price_amount) — but with ONE difference: no
 * currency column per line, and no currency column even per line-pair.
 * A journal entry carries ONE currency for the whole entry
 * (journal_entries.currency), fixed to the tenant's own
 * tenant_settings.currency_code at creation time
 * (JournalEntriesService.create()) — a general ledger only makes sense
 * summed in one currency; letting different entries pick different
 * currencies (like Purchase/Sales orders can, via
 * supplier/customer.defaultCurrency) would make trial-balance and
 * financial-statement totals meaningless without an FX-conversion layer
 * this codebase doesn't have yet. This is a deliberate simplification,
 * not an oversight — flagged in claude/accounting-module-status.md.
 *
 * journal_entry_lines_exactly_one_side enforces the fundamental
 * double-entry shape at the database level: a line is either a debit
 * line or a credit line, never both, never neither. The "total debits
 * must equal total credits" invariant (the entry as a whole must
 * balance) is NOT a column-level CHECK — it spans multiple rows, so it's
 * enforced in JournalEntriesService.create()/update()/post() instead,
 * same pattern as assertSingleCurrency() in Purchases/Sales.
 *
 * status: 'draft' | 'posted' | 'cancelled' — deliberately mirrors
 * Purchase/Sales Invoices' exact shape (cancel() only ever accepts
 * 'draft', matching their own "a posted document is a ledger-worthy
 * fact; reversing one needs a real accounting reversal, not a plain
 * cancel" reasoning). reversal_of_entry_id is that real reversal
 * mechanism: JournalEntriesService.reverse() creates a NEW entry with
 * every line's debit/credit swapped, rather than voiding or deleting a
 * posted entry — preserves the audit trail, standard double-entry
 * practice, and the concrete precedent found during this stage's
 * research pass (Daftra's own docs describe only a draft/final
 * distinction, no destructive void of a posted entry).
 *
 * source: 'manual' | 'auto' — Stage 2 only ever writes 'manual' rows;
 * 'auto' is forward-compatible plumbing for Stage 3 (auto-posting from
 * Sales/Purchases invoice events), which also needs the "pending review"
 * staging state §9.2 requires IF the tenant enables that option — not
 * added to the status CHECK constraint yet, since nothing produces it in
 * this stage; Stage 3 will need its own migration to widen the
 * constraint rather than speculatively widening it now.
 *
 * No period_id column on journal_entries — the accounting period for a
 * given entry_date is looked up via accounting_periods' date range
 * (AccountingPeriodsService.assertOpenForDate(), called from post(), not
 * create()/update() — a draft can be written for any date, but posting
 * requires that date's period to be open) rather than stored
 * redundantly, matching the "never store what's derivable" principle
 * used throughout this codebase.
 *
 * No new permission — reuses 'accounting.manage' from 0048.
 */
const migration: TenantMigration = {
  name: '0050_create_journal_entries',
  async up(db) {
    await sql`
      CREATE TABLE journal_entries (
        id UUID PRIMARY KEY,
        entry_number TEXT NOT NULL,
        entry_date DATE NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
        description TEXT,
        reversal_of_entry_id UUID REFERENCES journal_entries (id) ON DELETE RESTRICT,
        posted_at TIMESTAMPTZ,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT journal_entries_entry_number_unique UNIQUE (entry_number)
      )
    `.execute(db);

    await sql`
      CREATE TABLE journal_entry_lines (
        id UUID PRIMARY KEY,
        journal_entry_id UUID NOT NULL REFERENCES journal_entries (id) ON DELETE CASCADE,
        account_id UUID NOT NULL REFERENCES chart_of_accounts (id) ON DELETE RESTRICT,
        debit_amount BIGINT NOT NULL DEFAULT 0,
        credit_amount BIGINT NOT NULL DEFAULT 0,
        description TEXT,
        line_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT journal_entry_lines_amounts_non_negative CHECK (debit_amount >= 0 AND credit_amount >= 0),
        CONSTRAINT journal_entry_lines_exactly_one_side CHECK (
          (debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0)
        )
      )
    `.execute(db);

    await sql`CREATE INDEX journal_entries_status_idx ON journal_entries (status)`.execute(db);
    await sql`CREATE INDEX journal_entries_entry_date_idx ON journal_entries (entry_date)`.execute(db);
    await sql`CREATE INDEX journal_entry_lines_journal_entry_id_idx ON journal_entry_lines (journal_entry_id)`.execute(
      db,
    );
    await sql`CREATE INDEX journal_entry_lines_account_id_idx ON journal_entry_lines (account_id)`.execute(db);
  },
};

export default migration;
