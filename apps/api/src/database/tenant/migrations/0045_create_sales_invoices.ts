import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * sales_invoices + sales_invoice_lines (master doc §10, step 4 — Sales,
 * Stage 5). The mirror image of Purchase Invoices (migration 0038) and
 * this module's first genuinely financial document: posting one (not
 * creating it — see SalesInvoicesService.post(), same two-step shape as
 * every prior Sales document) writes to the Outbox (shared/outbox/) in
 * the same transaction as the status flip, publishing
 * 'sales.sales_invoice.posted' for Accounting to eventually consume
 * with a real delivery guarantee — the one event in this module that
 * cannot just rely on plain EventEmitter2 (CLAUDE.md §2.7). This is
 * also where the ETA e-invoice submission engine will eventually attach
 * (claude/sales-einvoice-spike.md §6) — not built here, only the
 * financial document itself.
 *
 * Lines reference sales_order_line_id, NOT delivery_line_id — same
 * choice Purchase Invoices made (purchase_order_line_id, not
 * goods_receipt_line_id): invoicing tracks against what was ordered,
 * independently of what has physically shipped, so partial/advance
 * billing ahead of full delivery is possible. quantityInvoiced is
 * validated against (ordered - already invoiced across every previously
 * *posted* invoice for that line) — same shape as
 * purchase_invoice_lines/goods_receipt_lines. unit_price defaults to
 * the sales order line's price but can be overridden.
 *
 * No customer-facing "their invoice number" field, unlike Purchase
 * Invoices' supplier_invoice_number — there, that field exists because
 * the SUPPLIER issues their own bill and we need to reconcile against
 * it. Here we are the ones issuing the invoice; there is no external
 * document to match.
 *
 * No total_amount column — computed on read via
 * calculateSalesInvoiceTotal(), same "don't store what's derivable"
 * principle as sales_orders/quotations. assertSingleCurrency() applied
 * from the start, same as every Sales document so far.
 *
 * Status kept simple: draft -> posted | cancelled. cancel() only
 * accepts 'draft' — once posted, an invoice is a ledger-worthy fact;
 * reversing one is a real, separate accounting operation (a sales
 * credit note / reversal), not a plain cancel — same reasoning as
 * Purchase Invoices.
 */
const migration: TenantMigration = {
  name: '0045_create_sales_invoices',
  async up(db) {
    await sql`
      CREATE TABLE sales_invoices (
        id UUID PRIMARY KEY,
        invoice_number TEXT NOT NULL,
        sales_order_id UUID NOT NULL REFERENCES sales_orders (id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
        invoice_date DATE,
        due_date DATE,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT sales_invoices_number_unique UNIQUE (invoice_number)
      )
    `.execute(db);

    await sql`
      CREATE TABLE sales_invoice_lines (
        id UUID PRIMARY KEY,
        sales_invoice_id UUID NOT NULL REFERENCES sales_invoices (id) ON DELETE CASCADE,
        sales_order_line_id UUID NOT NULL REFERENCES sales_order_lines (id) ON DELETE RESTRICT,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        quantity_invoiced NUMERIC NOT NULL,
        unit_price_amount BIGINT NOT NULL,
        unit_price_currency TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT sales_invoice_lines_quantity_positive CHECK (quantity_invoiced > 0),
        CONSTRAINT sales_invoice_lines_unit_price_non_negative CHECK (unit_price_amount >= 0)
      )
    `.execute(db);

    await sql`CREATE INDEX sales_invoices_sales_order_id_idx ON sales_invoices (sales_order_id)`.execute(db);
    await sql`CREATE INDEX sales_invoices_status_idx ON sales_invoices (status)`.execute(db);
    await sql`CREATE INDEX sales_invoice_lines_sales_invoice_id_idx ON sales_invoice_lines (sales_invoice_id)`.execute(db);
    await sql`CREATE INDEX sales_invoice_lines_sales_order_line_id_idx ON sales_invoice_lines (sales_order_line_id)`.execute(db);
  },
};

export default migration;
