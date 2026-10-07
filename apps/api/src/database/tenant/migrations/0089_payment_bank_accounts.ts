import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Customer receipts reach the ledger.
 *
 * Until now 'sales.payment_received.posted' had no Accounting listener, so
 * a collected payment never debited cash/bank nor cleared the customer's
 * receivable. The new listener needs to know WHERE the money went:
 *
 *  - payments_received.bank_account_id — the bank account a non-cash
 *    receipt was deposited to (transfer, cheque, card). Optional.
 *  - accounting_settings.default_bank_account_id — the chart account for
 *    non-cash receipts/payments when no bank account was chosen (default
 *    template 112 البنوك). Cash always goes to cash_account_id (111).
 */
const migration: TenantMigration = {
  name: '0089_payment_bank_accounts',
  async up(db) {
    await sql`
      ALTER TABLE payments_received
        ADD COLUMN bank_account_id UUID REFERENCES bank_accounts (id) ON DELETE RESTRICT
    `.execute(db);
    await sql`
      ALTER TABLE accounting_settings
        ADD COLUMN default_bank_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL
    `.execute(db);
    await sql`
      UPDATE accounting_settings
         SET default_bank_account_id = (SELECT id FROM chart_of_accounts WHERE code = '112' AND is_group = FALSE)
       WHERE default_bank_account_id IS NULL
    `.execute(db);
  },
};

export default migration;
