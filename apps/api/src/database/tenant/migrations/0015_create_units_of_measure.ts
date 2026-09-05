import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * units_of_measure (master doc §16.3): a small tenant-editable lookup
 * table Inventory's `products`/`product_variants` reference for their
 * base unit (e.g. "قطعة", "كجم", "متر"). Kept as a plain lookup, like
 * Settings' tax_rules — no conversion-factor table yet (unit conversion
 * between purchase/sale units is a real Odoo/competitor feature, but an
 * explicit non-blocking proposal, not part of this MVP entity list).
 */
const migration: TenantMigration = {
  name: '0015_create_units_of_measure',
  async up(db) {
    await sql`
      CREATE TABLE units_of_measure (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT units_of_measure_name_unique UNIQUE (name)
      )
    `.execute(db);
  },
};

export default migration;
