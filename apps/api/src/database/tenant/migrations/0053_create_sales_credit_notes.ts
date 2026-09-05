import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * sales_credit_notes + sales_credit_note_lines (master doc §10, step 4
 * — Sales; the real financial credit-note mechanism explicitly deferred
 * by migration 0047's own comment, now built per the user's explicit
 * approval). Closes the gap flagged throughout claude/sales-module-
 * status.md and claude/accounting-module-research.md's roadmap
 * (Stage 7): Sales Returns (migration 0047) was deliberately scoped to
 * the physical/operational return only, with no way for Accounting to
 * know how much revenue to reverse.
 *
 * A credit note is always AUTO-GENERATED, never user-created —
 * SalesReturnsService.confirm() creates exactly one, atomically, the
 * moment a sales return is confirmed (see that service's own comment).
 * There is deliberately no draft/status lifecycle here: unlike every
 * other financial document in this codebase, a credit note has nothing
 * to edit or approve — it is a derived record of a fact (goods came
 * back) that already happened when its source sales return was
 * confirmed, the one-way door. sales_return_id is UNIQUE — exactly one
 * credit note per sales return, never more, never zero once confirmed.
 *
 * Pricing is deliberately NOT traced through whatever Sales Invoice(s)
 * happen to cover the original sale — the alternative design considered
 * and rejected, per claude/accounting-module-research.md's roadmap
 * write-up: a delivery line can be invoiced fully, partially, or not at
 * all by the time a return happens, so "the invoiced price" is not
 * always a well-defined single number. Instead, unit_price is captured
 * directly from the ORIGINAL sales_order_line (via
 * sales_return_line -> delivery_line -> sales_order_line), the same
 * "reliable, stable, independent of invoicing status" price Sales
 * Invoices themselves default to when no per-line override is given
 * (createSalesInvoiceLineSchema.unitPrice). customer_id is captured
 * once at creation (denormalized, not re-derivable if the sales order
 * were ever deleted) rather than requiring a three-table join
 * (delivery -> sales_order -> customer) every time a credit note is
 * read.
 *
 * No unique constraint needs a numbering-sequence document type beyond
 * the usual one — 'sales_credit_note', same NumberingSequencesService
 * mechanism as every other financial document (tenant must configure
 * one via Settings before the first sales return can be confirmed,
 * same operational note as 'sales_return' itself).
 *
 * No new permission — reuses sales.manage, same as every other Sales
 * entity.
 */
const migration: TenantMigration = {
  name: '0053_create_sales_credit_notes',
  async up(db) {
    await sql`
      CREATE TABLE sales_credit_notes (
        id UUID PRIMARY KEY,
        credit_note_number TEXT NOT NULL,
        sales_return_id UUID NOT NULL REFERENCES sales_returns (id) ON DELETE RESTRICT,
        customer_id UUID NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
        currency TEXT NOT NULL,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT sales_credit_notes_number_unique UNIQUE (credit_note_number),
        CONSTRAINT sales_credit_notes_sales_return_unique UNIQUE (sales_return_id)
      )
    `.execute(db);

    await sql`
      CREATE TABLE sales_credit_note_lines (
        id UUID PRIMARY KEY,
        sales_credit_note_id UUID NOT NULL REFERENCES sales_credit_notes (id) ON DELETE CASCADE,
        sales_return_line_id UUID NOT NULL REFERENCES sales_return_lines (id) ON DELETE RESTRICT,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        quantity NUMERIC NOT NULL,
        unit_price_amount BIGINT NOT NULL,
        unit_price_currency TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT sales_credit_note_lines_quantity_positive CHECK (quantity > 0)
      )
    `.execute(db);

    await sql`CREATE INDEX sales_credit_notes_customer_id_idx ON sales_credit_notes (customer_id)`.execute(db);
    await sql`CREATE INDEX sales_credit_note_lines_sales_credit_note_id_idx ON sales_credit_note_lines (sales_credit_note_id)`.execute(db);
  },
};

export default migration;
