import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Direct purchase invoicing (Goods Receipts turned off): the invoice makes
 * its own receipt. It is created as a DRAFT with the invoice and confirmed
 * only when the invoice is posted — and cancelled with it — so a draft
 * invoice never moves stock. This column ties that receipt to its invoice.
 * NULL for every receipt made by hand.
 */
const migration: TenantMigration = {
  name: '0103_goods_receipt_source_invoice',
  async up(db) {
    await sql`
      ALTER TABLE goods_receipts
        ADD COLUMN source_purchase_invoice_id UUID REFERENCES purchase_invoices(id) ON DELETE SET NULL
    `.execute(db);
    await sql`
      CREATE INDEX goods_receipts_source_purchase_invoice_idx
        ON goods_receipts (source_purchase_invoice_id)
        WHERE source_purchase_invoice_id IS NOT NULL
    `.execute(db);
  },
};

export default migration;
