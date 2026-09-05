import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * purchase_returns + purchase_return_lines (master doc §10, step 3 —
 * Purchases, Stage 6; the second approved research-pass addition —
 * claude/purchases-module-research.md). Records goods physically sent
 * back to a supplier after a confirmed goods receipt.
 *
 * Deliberately scoped to the operational/physical return only, NOT a
 * financial debit note: a debit note is a document reducing what's owed
 * to the supplier, which only makes sense once there's a purchase
 * invoice/payable to reduce — Purchase Invoices (Stage 7) don't exist
 * yet. This stage delivers "quantity returned + stock decrease +
 * returnable-quantity bookkeeping"; the financial side is a natural
 * extension once Stage 7 exists, not invented here.
 *
 * A purchase return is tied to exactly ONE goods receipt (not spanning
 * multiple receipts or purchase orders) — every line references a
 * specific goods_receipt_line, which is what makes "how much of what
 * was actually received can still be returned" a well-defined question.
 * supplier_id / purchase_order_id / warehouse_id are deliberately NOT
 * duplicated on this table — they're always reachable via
 * goods_receipt_id, same "don't store what's derivable" principle as
 * purchase_orders' total_amount (migration 0032).
 *
 * unit_cost is likewise not stored on purchase_return_lines: a stock
 * 'out' movement (which is what a return produces — see
 * PurchaseReturnStockListener in the inventory module) always uses the
 * location's current average cost and ignores any caller-supplied cost
 * (see StockMovementsService's OutgoingParams), so there is nothing to
 * capture here yet. If a future debit-note value is ever needed, it's
 * computed from the original goods_receipt_line.unit_cost at that time.
 *
 * Status kept to the same simple shape as every other Purchases
 * document: draft -> confirmed | cancelled. Confirming is a one-way
 * door — same as Goods Receipts — and (deliberately) does NOT reopen or
 * downgrade the parent purchase order's received status; see
 * claude/purchases-module-status.md's Stage 6 write-up for the reasoning.
 */
const migration: TenantMigration = {
  name: '0036_create_purchase_returns',
  async up(db) {
    await sql`
      CREATE TABLE purchase_returns (
        id UUID PRIMARY KEY,
        return_number TEXT NOT NULL,
        goods_receipt_id UUID NOT NULL REFERENCES goods_receipts (id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
        return_date DATE,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT purchase_returns_number_unique UNIQUE (return_number)
      )
    `.execute(db);

    await sql`
      CREATE TABLE purchase_return_lines (
        id UUID PRIMARY KEY,
        purchase_return_id UUID NOT NULL REFERENCES purchase_returns (id) ON DELETE CASCADE,
        goods_receipt_line_id UUID NOT NULL REFERENCES goods_receipt_lines (id) ON DELETE RESTRICT,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        quantity_returned NUMERIC NOT NULL,
        reason TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT purchase_return_lines_quantity_positive CHECK (quantity_returned > 0)
      )
    `.execute(db);

    await sql`CREATE INDEX purchase_returns_goods_receipt_id_idx ON purchase_returns (goods_receipt_id)`.execute(db);
    await sql`CREATE INDEX purchase_returns_status_idx ON purchase_returns (status)`.execute(db);
    await sql`CREATE INDEX purchase_return_lines_purchase_return_id_idx ON purchase_return_lines (purchase_return_id)`.execute(db);
    await sql`CREATE INDEX purchase_return_lines_goods_receipt_line_id_idx ON purchase_return_lines (goods_receipt_line_id)`.execute(db);
  },
};

export default migration;
