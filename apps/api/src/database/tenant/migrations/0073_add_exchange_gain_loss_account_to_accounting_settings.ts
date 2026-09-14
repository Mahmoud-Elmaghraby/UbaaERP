import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Extends accounting_settings (migration 0052) with the one mapping
 * multi-currency Phase 4 will need (claude/multi-currency-strategy.md
 * §4.2/§6) — where a realized exchange gain/loss posts when a
 * foreign-currency invoice is settled at a different rate than the one
 * used when it was posted.
 *
 * Added now, in Phase 1, alongside exchange_rates (migration 0072) so
 * both schema pieces of the "infrastructure" phase land together —
 * nothing reads or writes this column yet. Deliberately NOT
 * auto-populated: the default chart-of-accounts template (migration
 * 0048) has no generic "exchange gain/loss" leaf account, same reasoning
 * and same nullable-FK-with-ON-DELETE-SET-NULL shape as
 * purchase_expense_account_id (migration 0054) and
 * cash_over_short_account_id (migration 0061) — starts NULL, and the
 * Phase 4 settlement handler will fail loudly (BusinessRuleError) until
 * a tenant admin configures it via Accounting Settings.
 */
const migration: TenantMigration = {
  name: '0073_add_exchange_gain_loss_account_to_accounting_settings',
  async up(db) {
    await sql`
      ALTER TABLE accounting_settings
        ADD COLUMN exchange_gain_loss_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL
    `.execute(db);
  },
};

export default migration;
