import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * deliveries + delivery_lines (master doc §10, step 4 — Sales, Stage 4).
 * Records physical shipment of goods against a confirmed (or already
 * partially delivered) sales order — the mirror image of Goods Receipts
 * (Purchases Stage 5), with one structural difference explained below.
 *
 * This is Sales' first stage with a real cross-module side effect:
 * DeliveriesService.confirm() (not create() — same two-step shape as
 * Goods Receipts) publishes 'sales.delivery.confirmed' on the Event Bus,
 * which Inventory listens for (DeliveryStockListener, living in the
 * inventory module) to record an 'out' stock movement. Sales never calls
 * Inventory directly (CLAUDE.md §2.6).
 *
 * warehouse_id and product_variant_id are genuine cross-module foreign
 * keys (REFERENCES warehouses / product_variants) — a DB FK, not a code
 * import, same precedent as goods_receipts (0035).
 *
 * sales_order_line_id ties each line back to what was ordered, so
 * DeliveriesService can validate quantityDelivered against (ordered -
 * already delivered across earlier *confirmed* deliveries) at creation
 * time — same shape as goods_receipt_lines.purchase_order_line_id.
 *
 * Difference from Goods Receipts: NO unit_cost column here. An outgoing
 * ('out') stock movement always uses the warehouse location's current
 * weighted-average cost (StockMovementsService.recordMovement()'s own
 * documented behavior — see PurchaseReturnStockListener's comment, the
 * existing precedent for a cost-free 'out' movement); there is nothing
 * for a delivery line to carry a cost for. So this stage's shape is
 * Goods Receipts' remaining-quantity validation combined with Purchase
 * Returns' cost-free 'out' movement mechanics, not a pure copy of either.
 *
 * Status kept to the same simple shape as every other Sales/Purchases
 * document: draft -> confirmed | cancelled. No "un-confirm" — correcting
 * an already-confirmed delivery is a Sales Returns concern (proposed,
 * not approved — claude/sales-module-research.md), not built here.
 */
const migration: TenantMigration = {
  name: '0044_create_deliveries',
  async up(db) {
    await sql`
      CREATE TABLE deliveries (
        id UUID PRIMARY KEY,
        delivery_number TEXT NOT NULL,
        sales_order_id UUID NOT NULL REFERENCES sales_orders (id) ON DELETE RESTRICT,
        warehouse_id UUID NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
        delivery_date DATE,
        notes TEXT,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT deliveries_number_unique UNIQUE (delivery_number)
      )
    `.execute(db);

    await sql`
      CREATE TABLE delivery_lines (
        id UUID PRIMARY KEY,
        delivery_id UUID NOT NULL REFERENCES deliveries (id) ON DELETE CASCADE,
        sales_order_line_id UUID NOT NULL REFERENCES sales_order_lines (id) ON DELETE RESTRICT,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        quantity_delivered NUMERIC NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT delivery_lines_quantity_positive CHECK (quantity_delivered > 0)
      )
    `.execute(db);

    await sql`CREATE INDEX deliveries_sales_order_id_idx ON deliveries (sales_order_id)`.execute(db);
    await sql`CREATE INDEX deliveries_warehouse_id_idx ON deliveries (warehouse_id)`.execute(db);
    await sql`CREATE INDEX deliveries_status_idx ON deliveries (status)`.execute(db);
    await sql`CREATE INDEX delivery_lines_delivery_id_idx ON delivery_lines (delivery_id)`.execute(db);
    await sql`CREATE INDEX delivery_lines_sales_order_line_id_idx ON delivery_lines (sales_order_line_id)`.execute(db);
  },
};

export default migration;
