import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * purchase_invoices + purchase_invoice_lines (master doc §10, step 3 —
 * Purchases, Stage 7). The last baseline entity from the master doc's
 * Purchases scope, and this codebase's first genuinely financial
 * document: posting one (PurchaseInvoicesService.post(), not create() —
 * same two-step shape as every prior document here) writes to the
 * Outbox (migration 0037 / shared/outbox/) in the same transaction as
 * the status flip, publishing 'purchases.purchase_invoice.posted' for
 * Accounting to eventually consume with a real delivery guarantee — the
 * one event in this whole module that cannot just rely on plain
 * EventEmitter2 (CLAUDE.md §2.7).
 *
 * supplier_invoice_number is the supplier's own bill/invoice number (for
 * matching against what they actually sent) — invoice_number is OUR
 * issued document number, allocated via NumberingSequencesService
 * (document_type 'purchase_invoice'), same mechanism as every other
 * document in this module.
 *
 * Lines reference purchase_order_line_id, the same partial-fulfillment
 * shape as goods_receipt_lines (migration 0035): quantityInvoiced is
 * validated against (ordered - already invoiced across every previously
 * *posted* invoice for that line), supporting multiple invoices against
 * one PO (e.g. partial billing, or billing ahead of full delivery).
 * unit_price defaults to the PO line's price but can be overridden (an
 * actual invoice sometimes carries a different, final price) — same
 * override pattern as goods receipts' unit_cost.
 *
 * No total_amount column — computed on read via
 * calculatePurchaseInvoiceTotal(), same "don't store what's derivable"
 * principle as purchase_orders (migration 0032). assertSingleCurrency()
 * is applied from the start here (the BusinessRuleError-wrapping lesson
 * Stage 4 had to learn the hard way for purchase_orders is applied
 * up front this time, not retrofitted).
 *
 * Status kept simple: draft -> posted | cancelled. cancel() only accepts
 * 'draft' — once posted, an invoice is a ledger-worthy fact; reversing
 * one is a real, separate accounting operation (a credit note / reversal
 * event) that doesn't exist yet, not a plain cancel.
 */
const migration: TenantMigration = {
  name: '0038_create_purchase_invoices',
  async up(db) {
    await sql`
      CREATE TABLE purchase_invoices (
        id UUID PRIMARY KEY,
        invoice_number TEXT NOT NULL,
        supplier_invoice_number TEXT,
        purchase_order_id UUID NOT NULL REFERENCES purchase_orders (id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
        invoice_date DATE,
        due_date DATE,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT purchase_invoices_number_unique UNIQUE (invoice_number)
      )
    `.execute(db);

    await sql`
      CREATE TABLE purchase_invoice_lines (
        id UUID PRIMARY KEY,
        purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices (id) ON DELETE CASCADE,
        purchase_order_line_id UUID NOT NULL REFERENCES purchase_order_lines (id) ON DELETE RESTRICT,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        quantity_invoiced NUMERIC NOT NULL,
        unit_price_amount BIGINT NOT NULL,
        unit_price_currency TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT purchase_invoice_lines_quantity_positive CHECK (quantity_invoiced > 0),
        CONSTRAINT purchase_invoice_lines_unit_price_non_negative CHECK (unit_price_amount >= 0)
      )
    `.execute(db);

    await sql`CREATE INDEX purchase_invoices_purchase_order_id_idx ON purchase_invoices (purchase_order_id)`.execute(db);
    await sql`CREATE INDEX purchase_invoices_status_idx ON purchase_invoices (status)`.execute(db);
    await sql`CREATE INDEX purchase_invoice_lines_purchase_invoice_id_idx ON purchase_invoice_lines (purchase_invoice_id)`.execute(db);
    await sql`CREATE INDEX purchase_invoice_lines_purchase_order_line_id_idx ON purchase_invoice_lines (purchase_order_line_id)`.execute(db);
  },
};

export default migration;
