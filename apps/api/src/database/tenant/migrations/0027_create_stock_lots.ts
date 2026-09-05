import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Lot/Serial/Expiry tracking (competitor research, CLAUDE.md §17 — Odoo/
 * Zoho ship batch/lot numbers with expiry dates and FIFO-by-expiry
 * consumption, plus serial-number tracking for individually-identified
 * units; approved by the user on 2026-08-28).
 *
 * Design (see StockMovementsService for the consuming logic):
 *  - products.tracking_type ('none' | 'lot' | 'serial') opts a product in.
 *    Serial tracking reuses the exact same tables as lot tracking — a
 *    serial number is just a lot whose quantity is always exactly 1.
 *  - stock_lots is the lot/serial header: one row per (variant, lot
 *    number), with a single fixed unit_cost (a physical batch has one
 *    purchase cost) and an optional expiry_date.
 *  - stock_lot_levels tracks how much of a given lot sits at a given
 *    location — separate from stock_levels (the pre-existing (variant,
 *    location) aggregate), which keeps being maintained in parallel as
 *    the blended weighted-average valuation used for reporting; lot
 *    tracking is about physical FIFO-by-expiry picking, not costing
 *    method — the two are intentionally decoupled.
 *  - stock_movements.stock_lot_id records which lot a movement drew from
 *    when exactly one lot was involved (always true for incoming
 *    movements and for an outgoing movement that only needed one lot).
 *  - stock_lot_consumptions is the audit trail for the case an outgoing
 *    movement's FIFO-by-expiry selection had to span more than one lot —
 *    stock_movements.quantity stays a single number, but each lot drawn
 *    from is still recorded individually here.
 */
const migration: TenantMigration = {
  name: '0027_create_stock_lots',
  async up(db) {
    await sql`ALTER TABLE products ADD COLUMN tracking_type TEXT NOT NULL DEFAULT 'none' CHECK (tracking_type IN ('none', 'lot', 'serial'))`.execute(
      db,
    );

    await sql`
      CREATE TABLE stock_lots (
        id UUID PRIMARY KEY,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        lot_number TEXT NOT NULL,
        expiry_date DATE,
        unit_cost_amount BIGINT NOT NULL,
        unit_cost_currency TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT stock_lots_variant_lot_number_unique UNIQUE (product_variant_id, lot_number)
      )
    `.execute(db);
    await sql`CREATE INDEX stock_lots_product_variant_id_idx ON stock_lots (product_variant_id)`.execute(db);
    await sql`CREATE INDEX stock_lots_expiry_date_idx ON stock_lots (expiry_date)`.execute(db);

    await sql`
      CREATE TABLE stock_lot_levels (
        id UUID PRIMARY KEY,
        stock_lot_id UUID NOT NULL REFERENCES stock_lots (id) ON DELETE RESTRICT,
        location_id UUID NOT NULL REFERENCES warehouse_locations (id) ON DELETE RESTRICT,
        warehouse_id UUID NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
        quantity_on_hand NUMERIC(18, 4) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT stock_lot_levels_lot_location_unique UNIQUE (stock_lot_id, location_id),
        CONSTRAINT stock_lot_levels_quantity_non_negative CHECK (quantity_on_hand >= 0)
      )
    `.execute(db);
    await sql`CREATE INDEX stock_lot_levels_stock_lot_id_idx ON stock_lot_levels (stock_lot_id)`.execute(db);
    await sql`CREATE INDEX stock_lot_levels_location_id_idx ON stock_lot_levels (location_id)`.execute(db);

    await sql`ALTER TABLE stock_movements ADD COLUMN stock_lot_id UUID REFERENCES stock_lots (id) ON DELETE RESTRICT`.execute(
      db,
    );
    await sql`CREATE INDEX stock_movements_stock_lot_id_idx ON stock_movements (stock_lot_id)`.execute(db);

    await sql`
      CREATE TABLE stock_lot_consumptions (
        id UUID PRIMARY KEY,
        stock_movement_id UUID NOT NULL REFERENCES stock_movements (id) ON DELETE CASCADE,
        stock_lot_id UUID NOT NULL REFERENCES stock_lots (id) ON DELETE RESTRICT,
        quantity NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE INDEX stock_lot_consumptions_stock_movement_id_idx ON stock_lot_consumptions (stock_movement_id)`.execute(
      db,
    );
    await sql`CREATE INDEX stock_lot_consumptions_stock_lot_id_idx ON stock_lot_consumptions (stock_lot_id)`.execute(
      db,
    );
  },
};

export default migration;
