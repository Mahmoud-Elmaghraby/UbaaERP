import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Accounting completion:
 *  - Year-end closing posts the year's profit or loss into retained
 *    earnings (أرباح مرحّلة, account 32 of the Egyptian template) — the
 *    account it uses, editable in Accounting Settings.
 *  - Journal entries take attachments (the supporting invoice, contract…).
 */
const migration: TenantMigration = {
  name: '0105_year_end_closing_and_entry_attachments',
  async up(db) {
    await sql`
      ALTER TABLE accounting_settings
        ADD COLUMN retained_earnings_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL
    `.execute(db);
    await sql`
      UPDATE accounting_settings
         SET retained_earnings_account_id = (SELECT id FROM chart_of_accounts WHERE code = '32' AND is_group = FALSE)
    `.execute(db);

    await sql`ALTER TABLE attachments DROP CONSTRAINT attachments_entity_type_whitelist`.execute(db);
    await sql`
      ALTER TABLE attachments ADD CONSTRAINT attachments_entity_type_whitelist CHECK (
        entity_type IN (
          'sales_invoice', 'purchase_invoice', 'sales_order', 'purchase_order',
          'product', 'supplier', 'customer', 'journal_entry'
        )
      )
    `.execute(db);
  },
};

export default migration;
