import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Installment schedules (التقسيط) on sales invoices — a collection plan,
 * not a financial document: nothing here is posted or reaches Accounting.
 * Rows are replaced as a whole (PUT) while nothing has been collected
 * against the invoice; each installment's status (paid / partially paid /
 * due / overdue) is computed on read from the invoice's collected amount.
 * Uses the existing 'sales.manage' permission (no new key).
 */
const migration: TenantMigration = {
  name: '0111_invoice_installments',
  async up(db) {
    await sql`
      CREATE TABLE sales_invoice_installments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sales_invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        due_date DATE NOT NULL,
        amount_amount BIGINT NOT NULL CHECK (amount_amount > 0),
        amount_currency VARCHAR(3) NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (sales_invoice_id, sequence)
      )
    `.execute(db);
    await sql`CREATE INDEX sales_invoice_installments_due_date_idx ON sales_invoice_installments (due_date)`.execute(db);
  },
};

export default migration;
