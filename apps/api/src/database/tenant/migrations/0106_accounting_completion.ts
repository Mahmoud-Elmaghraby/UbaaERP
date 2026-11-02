import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Accounting completion (approved 2026-11-02, "قفل الحسابات مطلقاً"):
 *  - entry approval: an optional rule that only holders of
 *    'accounting.approve' may post manual entries, and an optional review
 *    queue for automatic entries (CLAUDE.md §9.2 "for review");
 *  - recurring journal entries (rent, salaries accruals…);
 *  - fixed assets with monthly straight-line depreciation and disposal;
 *  - budgets per fiscal year, account and month (budget vs actual);
 *  - imported bank statement lines, matched against the books.
 */
const migration: TenantMigration = {
  name: '0106_accounting_completion',
  async up(db) {
    await sql`
      ALTER TABLE accounting_settings
        ADD COLUMN require_entry_approval BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN review_auto_entries BOOLEAN NOT NULL DEFAULT FALSE
    `.execute(db);

    await sql`
      INSERT INTO permissions (id, key, description)
      VALUES (gen_random_uuid(), 'accounting.approve', 'Approve (post) journal entries when approval is required')
      ON CONFLICT (key) DO NOTHING
    `.execute(db);
    // Whoever manages accounting today keeps posting as before.
    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT DISTINCT rp.role_id, p.id
      FROM role_permissions rp
      JOIN permissions old ON old.id = rp.permission_id AND old.key = 'accounting.manage'
      CROSS JOIN permissions p
      WHERE p.key = 'accounting.approve'
      ON CONFLICT DO NOTHING
    `.execute(db);

    await sql`
      CREATE TABLE recurring_journal_entries (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
        start_date DATE NOT NULL,
        next_run_date DATE NOT NULL,
        end_date DATE,
        auto_post BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        lines JSONB NOT NULL,
        last_entry_id UUID REFERENCES journal_entries (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`
      CREATE TABLE fixed_assets (
        id UUID PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        acquisition_date DATE NOT NULL,
        depreciation_start DATE NOT NULL,
        cost_amount BIGINT NOT NULL CHECK (cost_amount > 0),
        salvage_amount BIGINT NOT NULL DEFAULT 0 CHECK (salvage_amount >= 0),
        opening_accumulated_amount BIGINT NOT NULL DEFAULT 0 CHECK (opening_accumulated_amount >= 0),
        useful_life_months INTEGER NOT NULL CHECK (useful_life_months > 0),
        asset_account_id UUID NOT NULL REFERENCES chart_of_accounts (id),
        accumulated_account_id UUID NOT NULL REFERENCES chart_of_accounts (id),
        expense_account_id UUID NOT NULL REFERENCES chart_of_accounts (id),
        cost_center_id UUID REFERENCES cost_centers (id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fully_depreciated', 'disposed')),
        disposed_at DATE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (salvage_amount + opening_accumulated_amount <= cost_amount)
      )
    `.execute(db);
    await sql`
      CREATE TABLE fixed_asset_depreciations (
        id UUID PRIMARY KEY,
        fixed_asset_id UUID NOT NULL REFERENCES fixed_assets (id) ON DELETE CASCADE,
        period_end DATE NOT NULL,
        amount BIGINT NOT NULL CHECK (amount > 0),
        journal_entry_id UUID REFERENCES journal_entries (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (fixed_asset_id, period_end)
      )
    `.execute(db);

    await sql`
      CREATE TABLE budgets (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        fiscal_year_id UUID NOT NULL REFERENCES fiscal_years (id) ON DELETE CASCADE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`
      CREATE TABLE budget_lines (
        id UUID PRIMARY KEY,
        budget_id UUID NOT NULL REFERENCES budgets (id) ON DELETE CASCADE,
        account_id UUID NOT NULL REFERENCES chart_of_accounts (id),
        month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
        amount BIGINT NOT NULL,
        UNIQUE (budget_id, account_id, month)
      )
    `.execute(db);

    await sql`
      CREATE TABLE bank_statement_lines (
        id UUID PRIMARY KEY,
        treasury_id UUID NOT NULL REFERENCES treasuries (id) ON DELETE CASCADE,
        line_date DATE NOT NULL,
        description TEXT,
        reference TEXT,
        amount BIGINT NOT NULL CHECK (amount <> 0),
        status TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'matched', 'ignored')),
        matched_line_id UUID REFERENCES journal_entry_lines (id) ON DELETE SET NULL,
        import_batch TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE INDEX bank_statement_lines_treasury_idx ON bank_statement_lines (treasury_id, line_date)`.execute(db);
  },
};

export default migration;
