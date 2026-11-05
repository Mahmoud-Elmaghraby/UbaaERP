import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Cheques (دورة الشيكات), approved 2026-11-05.
 *
 * A cheque is the payment document itself — a customer receipt or a
 * supplier payment with payment method 'check' — plus the cheque's own
 * life on that row:
 *  - received (customer): in_hand → collected (into a bank) | bounced
 *    (رجع: the receipt no longer counts, the customer owes again) |
 *    endorsed (ظُهّر to a supplier as their payment).
 *  - issued (supplier): issued → cleared (the bank paid it).
 * Ledger: a received cheque sits in "أوراق قبض" until it is collected,
 * an issued one in "أوراق دفع" until it clears (the bank leaves only then).
 */
const ACCOUNTS = [
  { code: '119', name: 'أوراق قبض - شيكات تحت التحصيل', type: 'asset', balance: 'debit', parent: '11', column: 'notes_receivable_account_id' },
  { code: '2110', name: 'أوراق دفع - شيكات تحت الدفع', type: 'liability', balance: 'credit', parent: '21', column: 'notes_payable_account_id' },
];

const migration: TenantMigration = {
  name: '0112_cheques',
  async up(db) {
    for (const account of ACCOUNTS) {
      await sql`
        INSERT INTO chart_of_accounts (id, code, name, account_type, normal_balance, parent_id, is_group)
        SELECT gen_random_uuid(), ${account.code}, ${account.name}, ${account.type}, ${account.balance},
               (SELECT id FROM chart_of_accounts WHERE code = ${account.parent}), FALSE
        WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = ${account.code})
          AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = ${account.parent})
      `.execute(db);
    }
    await sql`
      ALTER TABLE accounting_settings
        ADD COLUMN notes_receivable_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
        ADD COLUMN notes_payable_account_id UUID REFERENCES chart_of_accounts (id) ON DELETE SET NULL
    `.execute(db);
    for (const account of ACCOUNTS) {
      await sql`
        UPDATE accounting_settings
           SET ${sql.ref(account.column)} = (SELECT id FROM chart_of_accounts WHERE code = ${account.code} AND is_group = FALSE)
      `.execute(db);
    }

    // A bounced receipt stops counting (balance, allocations, treasury) but stays on record.
    await sql`ALTER TABLE payments_received DROP CONSTRAINT IF EXISTS payments_received_status_check`.execute(db);
    await sql`
      ALTER TABLE payments_received
        ADD CONSTRAINT payments_received_status_check CHECK (status IN ('draft', 'posted', 'cancelled', 'bounced')),
        ADD COLUMN cheque_number TEXT,
        ADD COLUMN cheque_bank TEXT,
        ADD COLUMN cheque_due_date DATE,
        ADD COLUMN cheque_status TEXT CHECK (cheque_status IN ('in_hand', 'collected', 'bounced', 'endorsed')),
        ADD COLUMN cheque_status_date DATE,
        ADD COLUMN cheque_endorsed_to_payment_id UUID
    `.execute(db);
    await sql`
      ALTER TABLE supplier_payments
        ADD COLUMN cheque_number TEXT,
        ADD COLUMN cheque_bank TEXT,
        ADD COLUMN cheque_due_date DATE,
        ADD COLUMN cheque_status TEXT CHECK (cheque_status IN ('issued', 'cleared')),
        ADD COLUMN cheque_status_date DATE,
        ADD COLUMN endorsed_cheque_id UUID REFERENCES payments_received (id)
    `.execute(db);
    await sql`CREATE UNIQUE INDEX supplier_payments_endorsed_cheque_key ON supplier_payments (endorsed_cheque_id) WHERE endorsed_cheque_id IS NOT NULL AND status <> 'cancelled'`.execute(db);
    await sql`CREATE INDEX payments_received_cheque_due_idx ON payments_received (cheque_due_date) WHERE cheque_status IS NOT NULL`.execute(db);
    await sql`CREATE INDEX supplier_payments_cheque_due_idx ON supplier_payments (cheque_due_date) WHERE cheque_status IS NOT NULL`.execute(db);
  },
};

export default migration;
