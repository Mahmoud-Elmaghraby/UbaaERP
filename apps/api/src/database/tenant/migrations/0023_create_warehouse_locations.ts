import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * warehouse_locations (competitor research, CLAUDE.md §17 — Odoo ships
 * shelf/aisle-level locations within a warehouse; proposed and approved
 * by the user on 2026-08-28). Every warehouse gets exactly one auto-created
 * "default" location at creation time (WarehousesService.create()), the
 * same "always at least one" pattern as products/product_variants — so
 * stock_levels/stock_movements can key off location_id uniformly instead
 * of a nullable warehouse-or-location branch.
 */
const migration: TenantMigration = {
  name: '0023_create_warehouse_locations',
  async up(db) {
    await sql`
      CREATE TABLE warehouse_locations (
        id UUID PRIMARY KEY,
        warehouse_id UUID NOT NULL REFERENCES warehouses (id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT warehouse_locations_warehouse_code_unique UNIQUE (warehouse_id, code)
      )
    `.execute(db);

    await sql`CREATE INDEX warehouse_locations_warehouse_id_idx ON warehouse_locations (warehouse_id)`.execute(db);
  },
};

export default migration;
