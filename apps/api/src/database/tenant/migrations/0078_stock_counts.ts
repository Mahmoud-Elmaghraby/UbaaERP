import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Stock counts (inventory step 3 — reports & operations): one document type
 * for the two "set the shelf quantity" operations every customer needs on
 * day one and every month after.
 *
 *  - kind 'opening'   (رصيد أول المدة): lines carry a counted quantity and a
 *    unit cost; posting receives them as 'in' movements (lots/expiry for
 *    tracked items). How a new customer loads what is already on the shelf.
 *  - kind 'stocktake' (الجرد): lines snapshot the system quantity when they
 *    are added; posting sets on-hand to the counted quantity through
 *    adjustment_increase / adjustment_decrease movements (the difference is
 *    recomputed against the live quantity at posting, Odoo-style). Lines left
 *    uncounted (counted_quantity NULL) are ignored.
 *
 * A line is one (variant, location, lot) — lot_number is NULL for untracked
 * items. Draft → posted (one-way) or cancelled.
 */
const migration: TenantMigration = {
  name: '0078_stock_counts',
  async up(db) {
    await sql`
      CREATE TABLE stock_counts (
        id UUID PRIMARY KEY,
        count_number TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK (kind IN ('opening', 'stocktake')),
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
        count_date DATE,
        notes TEXT,
        created_by UUID,
        posted_by UUID,
        posted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE INDEX stock_counts_warehouse_idx ON stock_counts (warehouse_id)`.execute(db);

    await sql`
      CREATE TABLE stock_count_lines (
        id UUID PRIMARY KEY,
        stock_count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
        product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        location_id UUID NOT NULL REFERENCES warehouse_locations(id) ON DELETE RESTRICT,
        lot_number TEXT,
        expiry_date DATE,
        system_quantity NUMERIC(18, 4) NOT NULL DEFAULT 0,
        counted_quantity NUMERIC(18, 4) CHECK (counted_quantity >= 0),
        unit_cost_amount BIGINT CHECK (unit_cost_amount >= 0),
        unit_cost_currency TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT stock_count_lines_cost_pair CHECK ((unit_cost_amount IS NULL) = (unit_cost_currency IS NULL))
      )
    `.execute(db);
    await sql`
      CREATE UNIQUE INDEX stock_count_lines_key_uidx
        ON stock_count_lines (stock_count_id, product_variant_id, location_id, COALESCE(lot_number, ''))
    `.execute(db);
  },
};

export default migration;
