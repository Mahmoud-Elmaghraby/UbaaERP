import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * stock_levels (master doc §16.3): one row per (variant, warehouse),
 * created lazily on that pair's first stock movement. `average_cost_*`
 * holds the running weighted-average unit cost (CLAUDE.md §2.5 — Money
 * Value Object shape: integer minor units + ISO currency code), recalculated
 * by StockMovementsService on every 'in'/'transfer_in' movement — this table
 * never computes it itself. `reorder_point` backs the low-stock alerts panel
 * called out in the master document's Inventory frontend shape (master doc §14).
 *
 * quantity_on_hand is NUMERIC, not INTEGER — Inventory items are not always
 * whole units (e.g. kilograms, meters).
 */
const migration: TenantMigration = {
  name: '0019_create_stock_levels',
  async up(db) {
    await sql`
      CREATE TABLE stock_levels (
        id UUID PRIMARY KEY,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE CASCADE,
        warehouse_id UUID NOT NULL REFERENCES warehouses (id) ON DELETE CASCADE,
        quantity_on_hand NUMERIC(18, 4) NOT NULL DEFAULT 0,
        reorder_point NUMERIC(18, 4),
        average_cost_amount BIGINT NOT NULL DEFAULT 0,
        average_cost_currency TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT stock_levels_variant_warehouse_unique UNIQUE (product_variant_id, warehouse_id),
        CONSTRAINT stock_levels_quantity_non_negative CHECK (quantity_on_hand >= 0)
      )
    `.execute(db);

    await sql`CREATE INDEX stock_levels_warehouse_id_idx ON stock_levels (warehouse_id)`.execute(db);
  },
};

export default migration;
