import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Warehouse transfer document (inventory completion, step 4) — replaces the
 * single-line "move now" transfer with a numbered document (TRF-00001):
 *
 *   draft ──dispatch──▶ in_transit ──receive──▶ received
 *     │                     │
 *     └─cancel─▶ cancelled ◀┘ (an in-transit cancel puts the goods back at the source)
 *
 * "Post" does dispatch + receive in one step for same-day moves between
 * branches in one building. The two-step path is Odoo's transit-location
 * flow without a transit location: goods that left the source and have not
 * arrived are the transfer's dispatched lines (quantity and exact value
 * frozen at dispatch in `dispatched`), so the valuation report can show
 * "goods in transit" and nothing is ever double counted.
 *
 * Receiving may record less than was dispatched (breakage, theft on the
 * road): the shortage's value is written off through Accounting as an
 * inventory loss (see inventory.valuation.posted).
 *
 * Quantities on a line are in the line's unit (unit_factor base units per
 * unit, like every other document line since 0079); `dispatched` and
 * `received_quantity` are in BASE units.
 */
const migration: TenantMigration = {
  name: '0083_stock_transfers',
  async up(db) {
    await sql`
      CREATE TABLE stock_transfers (
        id UUID PRIMARY KEY,
        transfer_number TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_transit', 'received', 'cancelled')),
        from_warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
        from_location_id UUID NOT NULL REFERENCES warehouse_locations(id) ON DELETE RESTRICT,
        to_warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
        to_location_id UUID NOT NULL REFERENCES warehouse_locations(id) ON DELETE RESTRICT,
        transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
        notes TEXT,
        created_by UUID,
        dispatched_by UUID,
        dispatched_at TIMESTAMPTZ,
        received_by UUID,
        received_at TIMESTAMPTZ,
        cancelled_by UUID,
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT stock_transfers_distinct_locations CHECK (from_location_id <> to_location_id)
      )
    `.execute(db);
    await sql`CREATE INDEX stock_transfers_status_idx ON stock_transfers (status)`.execute(db);
    await sql`CREATE INDEX stock_transfers_from_idx ON stock_transfers (from_warehouse_id)`.execute(db);
    await sql`CREATE INDEX stock_transfers_to_idx ON stock_transfers (to_warehouse_id)`.execute(db);

    await sql`
      CREATE TABLE stock_transfer_lines (
        id UUID PRIMARY KEY,
        stock_transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
        line_number INTEGER NOT NULL,
        product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        quantity NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
        unit_of_measure_id UUID REFERENCES units_of_measure(id) ON DELETE RESTRICT,
        unit_factor NUMERIC(18, 6) NOT NULL DEFAULT 1 CHECK (unit_factor > 0),
        lot_allocations JSONB,
        dispatched JSONB,
        dispatched_value_amount BIGINT,
        dispatched_value_currency TEXT,
        received_quantity NUMERIC(18, 4) CHECK (received_quantity >= 0),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE INDEX stock_transfer_lines_transfer_idx ON stock_transfer_lines (stock_transfer_id)`.execute(db);
  },
};

export default migration;
