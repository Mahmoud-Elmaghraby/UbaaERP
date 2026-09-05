import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * accounting_settings (CLAUDE.md §10 — step 5, Accounting, Stage 6/7:
 * the default-account mapping auto-posting listeners need). A true
 * singleton, same enforced-at-the-DB-level shape as tenant_settings
 * (migration 0001): `singleton` is always TRUE with a UNIQUE
 * constraint, so a second row can never exist.
 *
 * Four purposes needed by what's actually built so far — COGS
 * auto-posting (debit cogs_account/credit inventory_account) and Sales
 * Credit Note revenue-reversal (debit sales_returns_contra_account/
 * credit accounts_receivable_account). Not a generic open-ended
 * "purpose -> account" table — deliberately just the four columns this
 * stage needs; add more named columns the moment a future stage needs
 * them, same "don't build speculative generality" discipline as the
 * rest of this codebase.
 *
 * Each column is a nullable FK to chart_of_accounts with ON DELETE SET
 * NULL — a tenant is free to delete/restructure their chart of
 * accounts (none of these four are is_system=true roots), so a mapping
 * can legitimately go stale; the auto-posting listeners are written to
 * fail loudly (BusinessRuleError) rather than guess when a mapping is
 * NULL, exactly like NumberingSequencesService.allocateNext() already
 * does for an unconfigured document type.
 *
 * Auto-populated from the known default-template codes (113 عملاء,
 * 114 المخزون, 51 تكلفة البضاعة المباعة, 42 مردودات ومسموحات المبيعات
 * — see migration 0048) the first time AccountingSettingsService.get()
 * runs on a tenant, same "auto-seeded, fully editable afterward" spirit
 * as the chart of accounts template itself (master doc §13 [مستقر]) —
 * done in application code (KyselyAccountingSettingsRepository), not
 * here, since it needs a SELECT against already-seeded rows, not a
 * static INSERT.
 */
const migration: TenantMigration = {
  name: '0052_create_accounting_settings',
  async up(db) {
    await sql`
      CREATE TABLE accounting_settings (
        id UUID PRIMARY KEY,
        singleton BOOLEAN NOT NULL DEFAULT TRUE,
        accounts_receivable_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        inventory_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        cogs_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        sales_returns_contra_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT accounting_settings_singleton_check CHECK (singleton = TRUE),
        CONSTRAINT accounting_settings_singleton_unique UNIQUE (singleton)
      )
    `.execute(db);
  },
};

export default migration;
