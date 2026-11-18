import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Who / where a journal line belongs to (project doc journal-line-parties-2026-11-18):
 *
 *  - customer_id / supplier_id / employee_id: a manual line on the Customers, Suppliers, employee
 *    advances or salaries-payable account must name the party, so the line shows on that party's
 *    statement and the books keep agreeing with the sub-ledgers. At most one per line.
 *  - treasury_id: a manual line on a treasury's account names the treasury, so it moves that
 *    treasury's balance like a voucher would.
 *
 * Real foreign keys (not a polymorphic id) so a party or treasury with lines can't be deleted.
 * Automatic entries leave them empty: their source document already carries the party.
 */
const migration: TenantMigration = {
  name: '0132_journal_line_parties',
  up: async (db) => {
    await sql`
      ALTER TABLE journal_entry_lines
        ADD COLUMN customer_id UUID REFERENCES customers (id),
        ADD COLUMN supplier_id UUID REFERENCES suppliers (id),
        ADD COLUMN employee_id UUID REFERENCES employees (id),
        ADD COLUMN treasury_id UUID REFERENCES treasuries (id),
        ADD CONSTRAINT journal_entry_lines_one_party_chk
          CHECK (num_nonnulls(customer_id, supplier_id, employee_id) <= 1)
    `.execute(db);
    await sql`CREATE INDEX journal_entry_lines_customer_idx ON journal_entry_lines (customer_id) WHERE customer_id IS NOT NULL`.execute(db);
    await sql`CREATE INDEX journal_entry_lines_supplier_idx ON journal_entry_lines (supplier_id) WHERE supplier_id IS NOT NULL`.execute(db);
    await sql`CREATE INDEX journal_entry_lines_employee_idx ON journal_entry_lines (employee_id) WHERE employee_id IS NOT NULL`.execute(db);
    await sql`CREATE INDEX journal_entry_lines_treasury_idx ON journal_entry_lines (treasury_id) WHERE treasury_id IS NOT NULL`.execute(db);
  },
};

export default migration;
