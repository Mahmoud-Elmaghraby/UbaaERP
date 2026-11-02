import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Direct sales invoicing (Deliveries turned off): the invoice makes its own
 * delivery — created as a DRAFT with the invoice, confirmed (stock out,
 * cost of goods sold) only when the invoice is posted, cancelled with it.
 * Same as 0103 for purchases. NULL for every delivery made by hand or by POS.
 */
const migration: TenantMigration = {
  name: '0104_delivery_source_invoice',
  async up(db) {
    await sql`
      ALTER TABLE deliveries
        ADD COLUMN source_sales_invoice_id UUID REFERENCES sales_invoices(id) ON DELETE SET NULL
    `.execute(db);
    await sql`
      CREATE INDEX deliveries_source_sales_invoice_idx
        ON deliveries (source_sales_invoice_id)
        WHERE source_sales_invoice_id IS NOT NULL
    `.execute(db);
  },
};

export default migration;
