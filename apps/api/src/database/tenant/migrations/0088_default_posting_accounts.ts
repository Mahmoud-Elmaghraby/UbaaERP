import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Default accounts for the three mappings still left empty on a new
 * tenant. Migrations 0054 / 0061 / 0073 deliberately left them NULL rather
 * than guess one of the "52" operating expenses — but an empty mapping
 * makes the posting fail in the background (outbox retries, then shows as
 * failed), which a new customer only discovers later as missing journal
 * entries. A dedicated, clearly named account is not a guess, and the
 * accountant can still remap it in Accounting › Settings:
 *
 *  - 55 مصروفات مشتريات وخدمات — purchase invoice service lines (stock
 *    lines go to GRNI since 0084) and, by default, the credit side of a
 *    landed cost, so a freight bill entered as a purchase invoice nets out
 *    against the landed cost and the cost ends up in inventory.
 *  - 56 عجز وزيادة الخزينة — POS session counted-vs-expected difference.
 *  - 57 فروق أسعار الصرف — realized FX gain/loss (one net account).
 *
 * Each account is created only when its code is unused, and a mapping is
 * filled only when it is still NULL.
 */
const ACCOUNTS: { code: string; name: string; column: string }[] = [
  { code: '55', name: 'مصروفات مشتريات وخدمات', column: 'purchase_expense_account_id' },
  { code: '56', name: 'عجز وزيادة الخزينة', column: 'cash_over_short_account_id' },
  { code: '57', name: 'فروق أسعار الصرف', column: 'exchange_gain_loss_account_id' },
];

const migration: TenantMigration = {
  name: '0088_default_posting_accounts',
  async up(db) {
    for (const account of ACCOUNTS) {
      await sql`
        INSERT INTO chart_of_accounts (id, code, name, account_type, normal_balance, parent_id, is_group)
        SELECT gen_random_uuid(), ${account.code}, ${account.name}, 'expense', 'debit',
               (SELECT id FROM chart_of_accounts WHERE code = '5'), FALSE
        WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = ${account.code})
          AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '5')
      `.execute(db);
      await sql`
        UPDATE accounting_settings
           SET ${sql.ref(account.column)} = (
                 SELECT id FROM chart_of_accounts
                  WHERE code = ${account.code} AND is_group = FALSE AND is_active = TRUE
                    AND name = ${account.name}
               )
         WHERE ${sql.ref(account.column)} IS NULL
      `.execute(db);
    }
  },
};

export default migration;
