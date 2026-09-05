import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * stock_movements (master doc §16.3): append-only ledger of every stock
 * change. `related_movement_id` self-references the paired row of a
 * warehouse-to-warehouse transfer (one 'transfer_out' + one 'transfer_in').
 * `resulting_average_cost_amount/currency` is a point-in-time snapshot of
 * stock_levels' average cost right after this movement was applied — kept
 * here (denormalized, on purpose) so historical movements remain accurate
 * even after later movements change the live average, matching how an
 * append-only ledger is expected to behave.
 *
 * `reference_type`/`reference_id` are free-form forward-compatible hooks
 * (e.g. a future purchase-receipt or sales-delivery row) — nullable, unused
 * by anything yet, since Purchases/Sales don't exist. No FK: the referenced
 * table doesn't exist yet and, per CLAUDE.md §2.6, Inventory must not gain a
 * hard dependency on modules built later.
 */
const migration: TenantMigration = {
  name: '0020_create_stock_movements',
  async up(db) {
    await sql`
      CREATE TABLE stock_movements (
        id UUID PRIMARY KEY,
        product_variant_id UUID NOT NULL REFERENCES product_variants (id),
        warehouse_id UUID NOT NULL REFERENCES warehouses (id),
        movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'transfer_in', 'transfer_out', 'adjustment_increase', 'adjustment_decrease')),
        quantity NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
        unit_cost_amount BIGINT,
        unit_cost_currency TEXT,
        resulting_average_cost_amount BIGINT NOT NULL,
        resulting_average_cost_currency TEXT NOT NULL,
        reference_type TEXT,
        reference_id UUID,
        related_movement_id UUID REFERENCES stock_movements (id),
        notes TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`CREATE INDEX stock_movements_variant_warehouse_idx ON stock_movements (product_variant_id, warehouse_id)`.execute(db);
    await sql`CREATE INDEX stock_movements_created_at_idx ON stock_movements (created_at)`.execute(db);
  },
};

export default migration;
