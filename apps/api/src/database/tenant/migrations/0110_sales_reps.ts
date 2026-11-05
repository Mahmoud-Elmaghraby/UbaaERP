import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Sales representatives (المندوبين).
 *
 *  - sales_reps: who sold. Optionally linked to a system user (a rep who
 *    also logs in); commission_percentage is stored for a later commission
 *    report — nothing computes with it yet.
 *  - customers.sales_rep_id: the customer's default rep.
 *  - sales_orders / sales_invoices.sales_rep_id: who the sale counts for.
 *    Defaulted from the customer when the document is created (the invoice
 *    from its order first), editable, NULL for POS sales.
 *
 * Uses the existing 'sales.manage' permission — no new key.
 */
const migration: TenantMigration = {
  name: '0110_sales_reps',
  async up(db) {
    await sql`
      CREATE TABLE sales_reps (
        id UUID PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        phone TEXT,
        user_id UUID REFERENCES users (id) ON DELETE SET NULL,
        commission_percentage NUMERIC(6,3) CHECK (commission_percentage IS NULL OR (commission_percentage >= 0 AND commission_percentage <= 100)),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`ALTER TABLE customers ADD COLUMN sales_rep_id UUID REFERENCES sales_reps (id) ON DELETE RESTRICT`.execute(db);
    await sql`ALTER TABLE sales_orders ADD COLUMN sales_rep_id UUID REFERENCES sales_reps (id) ON DELETE RESTRICT`.execute(db);
    await sql`ALTER TABLE sales_invoices ADD COLUMN sales_rep_id UUID REFERENCES sales_reps (id) ON DELETE RESTRICT`.execute(db);
    await sql`CREATE INDEX sales_invoices_sales_rep_idx ON sales_invoices (sales_rep_id) WHERE sales_rep_id IS NOT NULL`.execute(db);
  },
};

export default migration;
