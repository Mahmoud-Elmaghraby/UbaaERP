import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * product_variants (master doc §16.3): the actual stockable/sellable
 * unit — every stock_level/stock_movement row keys off
 * product_variant_id, never product_id directly (see 0017's note).
 * `barcode` is a small forward-compatible addition (nullable, unique
 * when present) ahead of barcode-scanning UI — a real, low-cost Odoo
 * feature found in the CLAUDE.md §17 competitor pass; scanning UI itself
 * is not being built now.
 */
const migration: TenantMigration = {
  name: '0018_create_product_variants',
  async up(db) {
    await sql`
      CREATE TABLE product_variants (
        id UUID PRIMARY KEY,
        product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
        sku TEXT NOT NULL,
        attribute_values JSONB NOT NULL DEFAULT '{}'::jsonb,
        barcode TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT product_variants_sku_unique UNIQUE (sku),
        CONSTRAINT product_variants_barcode_unique UNIQUE (barcode)
      )
    `.execute(db);

    await sql`CREATE INDEX product_variants_product_id_idx ON product_variants (product_id)`.execute(db);
  },
};

export default migration;
