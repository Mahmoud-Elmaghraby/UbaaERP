import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * goods_receipts + goods_receipt_lines (master doc §10, step 3 —
 * Purchases, Stage 5). Records physical receipt of goods against a
 * confirmed (or already partially received) purchase order.
 *
 * This is the first Purchases stage with a real cross-module side
 * effect: GoodsReceiptsService.confirm() (not create() — see that
 * file's comments) publishes 'purchases.goods_receipt.confirmed' on the
 * Event Bus, which Inventory listens for (GoodsReceiptStockListener,
 * living in the inventory module) to record an 'in' stock movement.
 * Purchases never calls Inventory directly (CLAUDE.md §2.6).
 *
 * warehouse_id and product_variant_id are genuine cross-module foreign
 * keys (REFERENCES warehouses / product_variants) — a DB FK, not a code
 * import, so §2.6 still holds. Same precedent already used by
 * purchase_order_lines.product_variant_id (see
 * claude/settings-module-status.md's user_branch_access -> branches note
 * for the original reasoning).
 *
 * purchase_order_line_id ties each line back to what was ordered, so
 * GoodsReceiptsService can validate quantityReceived against (ordered -
 * already received across earlier *confirmed* receipts) at creation
 * time, and support partial/multiple deliveries against one PO.
 * unit_cost defaults to the PO line's unit price but can be overridden
 * (e.g. the supplier's actual invoice differs slightly) — it feeds
 * Inventory's weighted-average costing on receipt, not just record-keeping.
 *
 * Status kept to the same simple shape as every other Purchases
 * document: draft -> confirmed | cancelled. A draft receipt has already
 * been validated against remaining PO quantity at creation time, but has
 * no stock effect at all until confirmed — confirming is a one-way door
 * (no "un-confirm"; correcting an already-confirmed receipt is a
 * Purchase Returns concern, Stage 6, not built yet).
 */
const migration: TenantMigration = {
  name: '0035_create_goods_receipts',
  async up(db) {
    await sql`
      CREATE TABLE goods_receipts (
        id UUID PRIMARY KEY,
        receipt_number TEXT NOT NULL,
        purchase_order_id UUID NOT NULL REFERENCES purchase_orders (id) ON DELETE RESTRICT,
        warehouse_id UUID NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
        received_date DATE,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT goods_receipts_number_unique UNIQUE (receipt_number)
      )
    `.execute(db);

    await sql`
      CREATE TABLE goods_receipt_lines (
        id UUID PRIMARY KEY,
        goods_receipt_id UUID NOT NULL REFERENCES goods_receipts (id) ON DELETE CASCADE,
        purchase_order_line_id UUID NOT NULL REFERENCES purchase_order_lines (id) ON DELETE RESTRICT,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        quantity_received NUMERIC NOT NULL,
        unit_cost_amount BIGINT NOT NULL,
        unit_cost_currency TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT goods_receipt_lines_quantity_positive CHECK (quantity_received > 0)
      )
    `.execute(db);

    await sql`CREATE INDEX goods_receipts_purchase_order_id_idx ON goods_receipts (purchase_order_id)`.execute(db);
    await sql`CREATE INDEX goods_receipts_warehouse_id_idx ON goods_receipts (warehouse_id)`.execute(db);
    await sql`CREATE INDEX goods_receipts_status_idx ON goods_receipts (status)`.execute(db);
    await sql`CREATE INDEX goods_receipt_lines_goods_receipt_id_idx ON goods_receipt_lines (goods_receipt_id)`.execute(db);
    await sql`CREATE INDEX goods_receipt_lines_purchase_order_line_id_idx ON goods_receipt_lines (purchase_order_line_id)`.execute(db);
  },
};

export default migration;
