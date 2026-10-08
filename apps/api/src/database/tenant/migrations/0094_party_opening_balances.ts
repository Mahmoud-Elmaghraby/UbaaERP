import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Opening balances of customers and suppliers (رصيد أول المدة) — what was
 * owed when the company started using the system. The first line of every
 * account statement, and part of the aging.
 *
 * Signed, in minor units, in the party's own sense:
 *   customer: + = the customer owes us (مدين),   − = we owe the customer (دائن)
 *   supplier: + = we owe the supplier (دائن),    − = the supplier owes us (مدين)
 * The currency is stored next to it (the party's default currency can
 * change later; the opening balance must not silently change with it).
 */
const migration: TenantMigration = {
  name: '0094_party_opening_balances',
  async up(db) {
    for (const table of ['customers', 'suppliers']) {
      await sql`
        ALTER TABLE ${sql.table(table)}
          ADD COLUMN opening_balance_amount BIGINT NOT NULL DEFAULT 0,
          ADD COLUMN opening_balance_currency TEXT,
          ADD COLUMN opening_balance_date DATE
      `.execute(db);
    }
  },
};

export default migration;
