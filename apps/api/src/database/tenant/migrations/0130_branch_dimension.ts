import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Branches as a dimension (project doc branches-plan-2026-11-18): one company, one chart of
 * accounts, shared master data; a branch tags where things happen so reports and access can be
 * per branch.
 *
 *  - branches.is_main: exactly one main branch (created when a tenant has none). Everything that
 *    can't be placed elsewhere belongs to it.
 *  - treasuries.branch_id (NOT NULL): which branch's cash or bank it is. Existing ones → main.
 *  - warehouses.branch_id: existing NULLs → main, then NOT NULL.
 *  - branch_id on document headers: quotations, sales orders / invoices / returns / credit notes,
 *    payments received, customer refunds, POS sessions, channel settlements, purchase orders /
 *    invoices / returns / debit notes, supplier payments, treasury vouchers, journal entries.
 *    Deliveries, goods receipts and stock documents take theirs from their warehouse.
 *  - journal_entry_lines.branch_id: the line's branch (a transfer between branches has both).
 *
 * Backfill: from each document's warehouse or treasury, else its parent document, else main.
 * Columns stay nullable on documents so an old code path that doesn't set one yet can't fail;
 * the services fill them.
 */
const DOCUMENT_TABLES = [
  'quotations',
  'sales_orders',
  'sales_invoices',
  'sales_returns',
  'sales_credit_notes',
  'payments_received',
  'customer_refunds',
  'pos_sessions',
  'channel_settlements',
  'purchase_orders',
  'purchase_invoices',
  'purchase_returns',
  'purchase_debit_notes',
  'supplier_payments',
  'treasury_vouchers',
  'journal_entries',
  'journal_entry_lines',
] as const;

const migration: TenantMigration = {
  name: '0130_branch_dimension',
  up: async (db) => {
    // --- The main branch -------------------------------------------------------------------
    await sql`ALTER TABLE branches ADD COLUMN is_main BOOLEAN NOT NULL DEFAULT FALSE`.execute(db);
    await sql`
      INSERT INTO branches (id, name, code, is_active, custom_fields, is_main)
      SELECT gen_random_uuid(), 'الفرع الرئيسي', 'MAIN', TRUE, '{}'::jsonb, TRUE
       WHERE NOT EXISTS (SELECT 1 FROM branches)
    `.execute(db);
    await sql`
      UPDATE branches SET is_main = TRUE
       WHERE id = (SELECT id FROM branches ORDER BY is_active DESC, created_at, id LIMIT 1)
         AND NOT EXISTS (SELECT 1 FROM branches WHERE is_main)
    `.execute(db);
    await sql`CREATE UNIQUE INDEX branches_one_main_idx ON branches (is_main) WHERE is_main`.execute(db);
    const main = sql`(SELECT id FROM branches WHERE is_main)`;

    // --- Places ------------------------------------------------------------------------------
    await sql`UPDATE warehouses SET branch_id = ${main} WHERE branch_id IS NULL`.execute(db);
    await sql`ALTER TABLE warehouses ALTER COLUMN branch_id SET NOT NULL`.execute(db);
    await sql`ALTER TABLE treasuries ADD COLUMN branch_id UUID REFERENCES branches (id)`.execute(db);
    await sql`UPDATE treasuries SET branch_id = ${main}`.execute(db);
    await sql`ALTER TABLE treasuries ALTER COLUMN branch_id SET NOT NULL`.execute(db);
    await sql`CREATE INDEX treasuries_branch_idx ON treasuries (branch_id)`.execute(db);

    for (const table of DOCUMENT_TABLES) {
      await sql`ALTER TABLE ${sql.table(table)} ADD COLUMN branch_id UUID REFERENCES branches (id)`.execute(db);
    }

    // --- Backfill, parents before children -------------------------------------------------
    await sql`
      UPDATE pos_sessions s SET branch_id = w.branch_id FROM warehouses w WHERE w.id = s.warehouse_id
    `.execute(db);
    await sql`
      UPDATE pos_sessions s SET branch_id = t.branch_id FROM treasuries t
       WHERE s.branch_id IS NULL AND t.id = s.treasury_id
    `.execute(db);

    await sql`
      UPDATE sales_orders o SET branch_id = s.branch_id FROM pos_sessions s WHERE s.id = o.pos_session_id
    `.execute(db);
    await sql`
      UPDATE sales_orders o SET branch_id = x.branch_id
        FROM (SELECT DISTINCT ON (d.sales_order_id) d.sales_order_id, w.branch_id
                FROM deliveries d JOIN warehouses w ON w.id = d.warehouse_id
               ORDER BY d.sales_order_id, d.created_at) x
       WHERE o.branch_id IS NULL AND x.sales_order_id = o.id
    `.execute(db);
    await sql`
      UPDATE quotations q SET branch_id = o.branch_id FROM sales_orders o
       WHERE o.source_quotation_id = q.id AND o.branch_id IS NOT NULL
    `.execute(db);
    await sql`
      UPDATE sales_invoices i SET branch_id = o.branch_id FROM sales_orders o WHERE o.id = i.sales_order_id
    `.execute(db);
    await sql`
      UPDATE sales_returns r SET branch_id = w.branch_id
        FROM deliveries d JOIN warehouses w ON w.id = d.warehouse_id
       WHERE d.id = r.delivery_id
    `.execute(db);
    await sql`
      UPDATE sales_credit_notes c SET branch_id = r.branch_id FROM sales_returns r WHERE r.id = c.sales_return_id
    `.execute(db);
    await sql`
      UPDATE payments_received p SET branch_id = s.branch_id FROM pos_sessions s WHERE s.id = p.pos_session_id
    `.execute(db);
    await sql`
      UPDATE payments_received p SET branch_id = t.branch_id FROM treasuries t
       WHERE p.branch_id IS NULL AND t.id = p.treasury_id
    `.execute(db);
    await sql`
      UPDATE customer_refunds r SET branch_id = s.branch_id FROM pos_sessions s WHERE s.id = r.pos_session_id
    `.execute(db);
    await sql`
      UPDATE customer_refunds r SET branch_id = t.branch_id FROM treasuries t
       WHERE r.branch_id IS NULL AND t.id = r.treasury_id
    `.execute(db);
    await sql`
      UPDATE treasury_vouchers v SET branch_id = s.branch_id FROM pos_sessions s WHERE s.id = v.pos_session_id
    `.execute(db);
    await sql`
      UPDATE treasury_vouchers v SET branch_id = t.branch_id FROM treasuries t
       WHERE v.branch_id IS NULL AND t.id = v.treasury_id
    `.execute(db);

    await sql`
      UPDATE purchase_orders o SET branch_id = x.branch_id
        FROM (SELECT DISTINCT ON (g.purchase_order_id) g.purchase_order_id, w.branch_id
                FROM goods_receipts g JOIN warehouses w ON w.id = g.warehouse_id
               ORDER BY g.purchase_order_id, g.created_at) x
       WHERE x.purchase_order_id = o.id
    `.execute(db);
    await sql`
      UPDATE purchase_invoices i SET branch_id = o.branch_id FROM purchase_orders o WHERE o.id = i.purchase_order_id
    `.execute(db);
    await sql`
      UPDATE purchase_returns r SET branch_id = w.branch_id
        FROM goods_receipts g JOIN warehouses w ON w.id = g.warehouse_id
       WHERE g.id = r.goods_receipt_id
    `.execute(db);
    await sql`
      UPDATE purchase_debit_notes d SET branch_id = r.branch_id FROM purchase_returns r WHERE r.id = d.purchase_return_id
    `.execute(db);
    await sql`
      UPDATE supplier_payments p SET branch_id = t.branch_id FROM treasuries t WHERE t.id = p.treasury_id
    `.execute(db);

    // Journal entries: the source document's branch; stock-driven entries by the warehouse
    // their movements touched.
    const fromDoc = async (type: string, table: string) =>
      sql`
        UPDATE journal_entries e SET branch_id = d.branch_id FROM ${sql.table(table)} d
         WHERE e.branch_id IS NULL AND e.source_reference_type = ${type} AND e.source_reference_id = d.id
      `.execute(db);
    await fromDoc('sales_invoice', 'sales_invoices');
    await fromDoc('sales_credit_note', 'sales_credit_notes');
    await fromDoc('payment_received', 'payments_received');
    await fromDoc('customer_refund', 'customer_refunds');
    await fromDoc('pos_session', 'pos_sessions');
    await fromDoc('channel_settlement', 'channel_settlements');
    await fromDoc('purchase_invoice', 'purchase_invoices');
    await fromDoc('purchase_debit_note', 'purchase_debit_notes');
    await fromDoc('supplier_payment', 'supplier_payments');
    await fromDoc('treasury_voucher', 'treasury_vouchers');
    await sql`
      UPDATE journal_entries e SET branch_id = t.branch_id FROM treasuries t
       WHERE e.branch_id IS NULL AND e.source_reference_type = 'treasury_opening_balance' AND e.source_reference_id = t.id
    `.execute(db);
    await sql`
      UPDATE journal_entries e SET branch_id = x.branch_id
        FROM (SELECT DISTINCT ON (m.reference_id) m.reference_id, w.branch_id
                FROM stock_movements m JOIN warehouses w ON w.id = m.warehouse_id
               WHERE m.reference_id IS NOT NULL
               ORDER BY m.reference_id, m.created_at) x
       WHERE e.branch_id IS NULL AND e.source_reference_id = x.reference_id
    `.execute(db);
    await sql`
      UPDATE journal_entries e SET branch_id = r.branch_id FROM hr_payroll_runs r
       WHERE e.branch_id IS NULL AND e.source_reference_type = 'hr_payroll' AND e.source_reference_id = r.id
         AND r.branch_id IS NOT NULL
    `.execute(db);

    // Whatever is still unplaced belongs to the main branch.
    for (const table of DOCUMENT_TABLES) {
      if (table === 'journal_entry_lines') continue;
      await sql`UPDATE ${sql.table(table)} SET branch_id = ${main} WHERE branch_id IS NULL`.execute(db);
    }
    await sql`
      UPDATE journal_entry_lines l SET branch_id = e.branch_id FROM journal_entries e WHERE e.id = l.journal_entry_id
    `.execute(db);

    for (const table of DOCUMENT_TABLES) {
      await sql`CREATE INDEX ${sql.raw(`${table}_branch_idx`)} ON ${sql.table(table)} (branch_id)`.execute(db);
    }
  },
};

export default migration;
