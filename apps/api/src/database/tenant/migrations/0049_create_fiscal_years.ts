import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * fiscal_years + accounting_periods (CLAUDE.md §10 — step 5, Accounting).
 *
 * Not in the master doc's own §16.6 entity list (which names only
 * chart_of_accounts, journal_entries, cost_centers, bank_accounts,
 * tax_returns) — added as necessary supporting plumbing for
 * journal_entries (Stage 2, not yet built): a double-entry ledger needs
 * a period-close mechanism so a prior period can be "locked" once
 * reconciled, matching standard practice at every competitor examined
 * this pass (Daftra, Odoo — see claude/accounting-module-research.md).
 * This is schema/architecture-adjacent, not a feature-scope decision, so
 * it's called out explicitly here rather than silently folded into
 * journal_entries later.
 *
 * Two tables, both with just two states each (open/closed) — deliberately
 * not a three-tier open/closed/locked scheme. Nothing in this stage or
 * the immediate next one (journal entries) needs a distinct "hard lock"
 * tier beyond a plain close; adding one later is a compatible, additive
 * change (CLAUDE.md §17.2.3 — forward compatibility is a tiebreaker, not
 * a reason to build unrequested states now).
 *
 * fiscal_years.{start_date,end_date} and accounting_periods'
 * counterparts are DATE columns, represented as plain 'YYYY-MM-DD'
 * strings end-to-end (domain/contracts), matching the convention already
 * established for every other date-only column in this codebase (e.g.
 * quotations.valid_until_date, sales_invoices.due_date) — never a JS
 * Date object crossing a layer boundary.
 *
 * accounting_periods rows are generated automatically, one per calendar
 * month, when a fiscal year is created (FiscalYearsService.create(),
 * inside the same transaction) — there is no standalone "create a
 * period" endpoint; a period's whole lifecycle is owned by its fiscal
 * year, same "no independent create — derived from a parent, closed
 * lifecycle" shape already used for e.g. accounting_periods' closest
 * analogue in spirit, Purchases' goods_receipt_lines.
 *
 * No new permission seeded here — reuses 'accounting.manage' from
 * 0048, matching the one-permission-per-module convention.
 */
const migration: TenantMigration = {
  name: '0049_create_fiscal_years',
  async up(db) {
    await sql`
      CREATE TABLE fiscal_years (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT fiscal_years_date_order CHECK (end_date > start_date)
      )
    `.execute(db);

    await sql`
      CREATE TABLE accounting_periods (
        id UUID PRIMARY KEY,
        fiscal_year_id UUID NOT NULL REFERENCES fiscal_years (id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT accounting_periods_date_order CHECK (end_date > start_date)
      )
    `.execute(db);

    await sql`CREATE INDEX fiscal_years_status_idx ON fiscal_years (status)`.execute(db);
    await sql`CREATE INDEX accounting_periods_fiscal_year_id_idx ON accounting_periods (fiscal_year_id)`.execute(db);
    await sql`CREATE INDEX accounting_periods_status_idx ON accounting_periods (status)`.execute(db);
    await sql`CREATE INDEX accounting_periods_date_range_idx ON accounting_periods (start_date, end_date)`.execute(db);
  },
};

export default migration;
