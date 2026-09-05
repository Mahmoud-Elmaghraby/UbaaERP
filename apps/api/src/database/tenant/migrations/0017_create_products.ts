import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * products (master doc §16.3): the base/template item. `attributes`
 * (JSONB, mandated by the master document explicitly for this table)
 * holds the *definition* of which variant-distinguishing attributes this
 * product uses (e.g. ["color", "size"]) — the dynamic attributes system
 * customization point called out in the master doc. Actual per-variant
 * values live on `product_variants.attribute_values`.
 *
 * `track_variants = false` products still get exactly one
 * `product_variants` row (created alongside the product) so every other
 * Inventory table (stock_levels, stock_movements) can always key off
 * `product_variant_id` uniformly, instead of a nullable
 * "product_id OR variant_id" branch everywhere downstream.
 */
const migration: TenantMigration = {
  name: '0017_create_products',
  async up(db) {
    await sql`
      CREATE TABLE products (
        id UUID PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        unit_of_measure_id UUID NOT NULL REFERENCES units_of_measure (id),
        track_variants BOOLEAN NOT NULL DEFAULT FALSE,
        attributes JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT products_code_unique UNIQUE (code)
      )
    `.execute(db);
  },
};

export default migration;
