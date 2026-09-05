import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Adds location_id to stock_levels/stock_movements (tracking granularity
 * moves from "which warehouse" to "which location within a warehouse" —
 * see 0023). Safe as a plain NOT NULL ADD COLUMN with no default: tenant
 * migrations only ever run once, against a freshly created empty schema
 * (CLAUDE.md §3 — provisioning and migration share the same code path),
 * so these tables are always empty when this file runs.
 *
 * Also fixes an oversight from 0019/0020's original design, now that
 * locations make the risk concrete: stock_levels.warehouse_id was
 * declared ON DELETE CASCADE, meaning deleting a warehouse would have
 * silently wiped its stock history. Recreated as RESTRICT (the default)
 * instead — deleting a warehouse/location that still has stock now fails
 * loudly (translated to ConflictError by the service layer) rather than
 * silently destroying inventory data. Nothing has ever been deployed
 * against this schema yet, so this is corrected here rather than left as
 * a known bug to patch later.
 */
const migration: TenantMigration = {
  name: '0024_add_location_to_stock',
  async up(db) {
    await sql`ALTER TABLE stock_levels DROP CONSTRAINT stock_levels_warehouse_id_fkey`.execute(db);
    await sql`ALTER TABLE stock_levels ADD CONSTRAINT stock_levels_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses (id)`.execute(db);

    await sql`ALTER TABLE stock_levels ADD COLUMN location_id UUID NOT NULL REFERENCES warehouse_locations (id)`.execute(db);
    await sql`ALTER TABLE stock_levels DROP CONSTRAINT stock_levels_variant_warehouse_unique`.execute(db);
    await sql`ALTER TABLE stock_levels ADD CONSTRAINT stock_levels_variant_location_unique UNIQUE (product_variant_id, location_id)`.execute(db);
    await sql`CREATE INDEX stock_levels_location_id_idx ON stock_levels (location_id)`.execute(db);

    await sql`ALTER TABLE stock_movements ADD COLUMN location_id UUID NOT NULL REFERENCES warehouse_locations (id)`.execute(db);
    await sql`CREATE INDEX stock_movements_location_id_idx ON stock_movements (location_id)`.execute(db);
  },
};

export default migration;
