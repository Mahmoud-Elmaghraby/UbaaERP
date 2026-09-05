import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * sales_returns + sales_return_lines (master doc §10, step 4 — Sales,
 * Stage 7; the approved research-pass addition — claude/sales-module-
 * research.md). Records goods physically sent back BY a customer after
 * a confirmed delivery. The mirror image of Purchases' Purchase Returns
 * (migration 0036), with the direction flipped: a purchase return sends
 * stock OUT back to a supplier; a sales return brings stock back IN
 * from a customer.
 *
 * Deliberately scoped to the operational/physical return only, NOT a
 * financial credit note — same scope boundary Purchase Returns drew
 * against Purchase Invoices, for the same reason: a credit note is a
 * document reducing what a customer owes (or is owed back), which is a
 * distinct financial mechanism of its own (how it interacts with an
 * already-*posted* Sales Invoice's immutable total, and with Payments
 * Received) — a real design decision that needs its own explicit
 * approval, not something to invent silently while building the
 * physical return. This stage delivers "quantity returned + stock
 * increase + returnable-quantity bookkeeping"; see
 * claude/sales-module-status.md for this flagged as a distinct,
 * deferred follow-up.
 *
 * A sales return is tied to exactly ONE delivery — every line
 * references a specific delivery_line, making "how much of what was
 * actually delivered can still be returned" well-defined. customer_id /
 * sales_order_id / warehouse_id are deliberately NOT duplicated here —
 * always reachable via delivery_id, same "don't store what's derivable"
 * principle used throughout this module.
 *
 * No unit_cost stored on sales_return_lines — same reasoning as
 * delivery_lines (migration 0044): the resulting 'in' stock movement's
 * valuation is decided by SalesReturnStockListener (inventory module)
 * at confirm time, using the (variant, location)'s CURRENT weighted-
 * average cost — not a cost captured here, since delivery_lines itself
 * never stored a cost to carry forward (deliveries only ever produce
 * cost-free 'out' movements).
 *
 * Status kept to the same simple shape as every other document in this
 * module: draft -> confirmed | cancelled. Confirming is a one-way door
 * and deliberately does NOT reopen or downgrade the parent sales
 * order's delivered status — same reasoning as Purchase Returns not
 * touching the purchase order's received status.
 */
const migration: TenantMigration = {
  name: '0047_create_sales_returns',
  async up(db) {
    await sql`
      CREATE TABLE sales_returns (
        id UUID PRIMARY KEY,
        return_number TEXT NOT NULL,
        delivery_id UUID NOT NULL REFERENCES deliveries (id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
        return_date DATE,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT sales_returns_number_unique UNIQUE (return_number)
      )
    `.execute(db);

    await sql`
      CREATE TABLE sales_return_lines (
        id UUID PRIMARY KEY,
        sales_return_id UUID NOT NULL REFERENCES sales_returns (id) ON DELETE CASCADE,
        delivery_line_id UUID NOT NULL REFERENCES delivery_lines (id) ON DELETE RESTRICT,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        quantity_returned NUMERIC NOT NULL,
        reason TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT sales_return_lines_quantity_positive CHECK (quantity_returned > 0)
      )
    `.execute(db);

    await sql`CREATE INDEX sales_returns_delivery_id_idx ON sales_returns (delivery_id)`.execute(db);
    await sql`CREATE INDEX sales_returns_status_idx ON sales_returns (status)`.execute(db);
    await sql`CREATE INDEX sales_return_lines_sales_return_id_idx ON sales_return_lines (sales_return_id)`.execute(db);
    await sql`CREATE INDEX sales_return_lines_delivery_line_id_idx ON sales_return_lines (delivery_line_id)`.execute(db);
  },
};

export default migration;
