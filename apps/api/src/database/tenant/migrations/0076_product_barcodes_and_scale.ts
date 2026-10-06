import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Product master data, part 2 (inventory step 3b).
 *
 *  - product_barcodes: extra barcodes per variant, beyond the primary
 *    product_variants.barcode — a manufacturer code next to an internal one,
 *    or a pack/carton barcode. `quantity` is how many base units one scan
 *    means (1 for an alternate barcode, 12 for a carton of 12). Uniqueness
 *    across BOTH this table and product_variants.barcode is enforced by the
 *    service (a scanned code must resolve to exactly one thing).
 *  - inventory_settings gains scale-barcode parsing (label printers on
 *    weighing scales print EAN-13s with the weight or price embedded):
 *      scale_barcode_enabled, scale_barcode_prefix (default '2', the GS1
 *      in-store range), scale_item_code_length (digits after the prefix that
 *      identify the item), scale_value_type ('weight' | 'price'),
 *      scale_value_decimals (weight in grams → 3, price in piastres → 2).
 */
const migration: TenantMigration = {
  name: '0076_product_barcodes_and_scale',
  async up(db) {
    await sql`
      CREATE TABLE product_barcodes (
        id UUID PRIMARY KEY,
        product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
        barcode TEXT NOT NULL,
        quantity NUMERIC(18, 4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
        label TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT product_barcodes_barcode_unique UNIQUE (barcode)
      )
    `.execute(db);
    await sql`CREATE INDEX product_barcodes_variant_idx ON product_barcodes (product_variant_id)`.execute(db);

    await sql`
      ALTER TABLE inventory_settings
        ADD COLUMN scale_barcode_enabled BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN scale_barcode_prefix TEXT NOT NULL DEFAULT '2' CHECK (scale_barcode_prefix ~ '^[0-9]{1,3}$'),
        ADD COLUMN scale_item_code_length INTEGER NOT NULL DEFAULT 5 CHECK (scale_item_code_length BETWEEN 3 AND 7),
        ADD COLUMN scale_value_type TEXT NOT NULL DEFAULT 'weight' CHECK (scale_value_type IN ('weight', 'price')),
        ADD COLUMN scale_value_decimals INTEGER NOT NULL DEFAULT 3 CHECK (scale_value_decimals BETWEEN 0 AND 3)
    `.execute(db);
  },
};

export default migration;
