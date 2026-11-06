import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Purchases integrity (2026-11-06):
 *  - goods_receipt_lines.unit_cost_amount >= 0 — a negative receipt cost
 *    would put negative value into stock. NOT VALID: enforced for every new
 *    or changed row without failing the migration on an old bad row.
 *  - purchase_orders.source_purchase_invoice_id — the direct purchase
 *    invoice (Purchase Orders turned off) that made this order for itself,
 *    so cancelling / deleting that invoice takes its order with it. NULL for
 *    every order made by hand. Same idea as 0103 for receipts.
 *  - One live purchase order per supplier quotation: a partial unique index
 *    (cancelled orders don't count — cancel the order to raise a new one).
 *    Skipped with a warning when a tenant already has duplicates; the
 *    service check (SUPPLIER_QUOTATION.ALREADY_ORDERED) still applies.
 *
 * Not here: a unique (supplier, supplier invoice number) index —
 * purchase_invoices has no supplier_id column (the supplier is the
 * order's), so PurchaseInvoicesService enforces it under a supplier row lock.
 */
const migration: TenantMigration = {
  name: '0114_purchases_integrity',
  async up(db) {
    await sql`
      ALTER TABLE goods_receipt_lines
        ADD CONSTRAINT goods_receipt_lines_unit_cost_non_negative CHECK (unit_cost_amount >= 0) NOT VALID
    `.execute(db);

    await sql`
      ALTER TABLE purchase_orders
        ADD COLUMN source_purchase_invoice_id UUID REFERENCES purchase_invoices(id) ON DELETE SET NULL
    `.execute(db);
    await sql`
      CREATE INDEX purchase_orders_source_purchase_invoice_idx
        ON purchase_orders (source_purchase_invoice_id)
        WHERE source_purchase_invoice_id IS NOT NULL
    `.execute(db);

    const duplicates = await sql<{ source_quotation_id: string }>`
      SELECT source_quotation_id
        FROM purchase_orders
       WHERE source_quotation_id IS NOT NULL AND status <> 'cancelled'
       GROUP BY source_quotation_id
      HAVING count(*) > 1
       LIMIT 1
    `.execute(db);
    if (duplicates.rows.length > 0) {
      console.warn(
        '[0114_purchases_integrity] purchase_orders has more than one live order for a supplier quotation — ' +
          'skipping purchase_orders_source_quotation_live_unique; cancel the extra orders and add it by a later migration.',
      );
    } else {
      await sql`
        CREATE UNIQUE INDEX purchase_orders_source_quotation_live_unique
          ON purchase_orders (source_quotation_id)
          WHERE source_quotation_id IS NOT NULL AND status <> 'cancelled'
      `.execute(db);
    }
  },
};

export default migration;
