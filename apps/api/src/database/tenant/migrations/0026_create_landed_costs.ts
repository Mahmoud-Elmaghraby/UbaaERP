import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Landed Cost (competitor research, CLAUDE.md §17 — Odoo/Zoho's "landed
 * cost" lets extra charges that arrive after a receipt — freight, customs,
 * insurance — be allocated across the received items' valuation; approved
 * by the user on 2026-08-28).
 *
 * Deliberately scoped to Inventory alone (no Purchases module exists yet):
 * a landed cost is applied against one or more existing 'in' stock
 * movements (the actual purchase receipts), spreading `total_cost` across
 * them by quantity or by value, and raising the CURRENT average cost of
 * whatever quantity from that movement is still on hand at that
 * (variant, location) — see LandedCostsService for why fully-consumed
 * stock cannot be landed-costed (there is no COGS/Accounting integration
 * yet to post a valuation adjustment against already-sold stock).
 *
 * landed_cost_allocations is the audit trail of how much of a landed
 * cost went to which movement, and what the resulting average cost was —
 * it does not touch stock_movements (a landed cost changes valuation, not
 * quantity, and stock_movements.quantity has a CHECK > 0).
 */
const migration: TenantMigration = {
  name: '0026_create_landed_costs',
  async up(db) {
    await sql`
      CREATE TABLE landed_costs (
        id UUID PRIMARY KEY,
        total_cost_amount BIGINT NOT NULL,
        total_cost_currency TEXT NOT NULL,
        allocation_method TEXT NOT NULL CHECK (allocation_method IN ('by_quantity', 'by_value')),
        reference_type TEXT,
        reference_id UUID,
        notes TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT landed_costs_total_cost_positive CHECK (total_cost_amount > 0)
      )
    `.execute(db);

    await sql`
      CREATE TABLE landed_cost_allocations (
        id UUID PRIMARY KEY,
        landed_cost_id UUID NOT NULL REFERENCES landed_costs (id) ON DELETE CASCADE,
        stock_movement_id UUID NOT NULL REFERENCES stock_movements (id) ON DELETE RESTRICT,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
        location_id UUID NOT NULL REFERENCES warehouse_locations (id) ON DELETE RESTRICT,
        warehouse_id UUID NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
        allocated_amount_amount BIGINT NOT NULL,
        allocated_amount_currency TEXT NOT NULL,
        resulting_average_cost_amount BIGINT NOT NULL,
        resulting_average_cost_currency TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT landed_cost_allocations_amount_positive CHECK (allocated_amount_amount > 0),
        CONSTRAINT landed_cost_allocations_unique_per_movement UNIQUE (landed_cost_id, stock_movement_id)
      )
    `.execute(db);

    await sql`CREATE INDEX landed_cost_allocations_landed_cost_id_idx ON landed_cost_allocations (landed_cost_id)`.execute(db);
    await sql`CREATE INDEX landed_cost_allocations_stock_movement_id_idx ON landed_cost_allocations (stock_movement_id)`.execute(db);
  },
};

export default migration;
