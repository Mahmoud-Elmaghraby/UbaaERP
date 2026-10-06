import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Product master data rebuild, part 1 (inventory step 3 —
 * claude/inventory-audit-2026-10.md, claude/target-customers-inventory-needs.md).
 *
 *  - inventory_settings: the Inventory module's own settings singleton
 *    (same shape as accounting_settings) — how item codes and barcodes are
 *    produced. Defaults keep today's behaviour exactly: codes typed by the
 *    user, barcodes optional/manual.
 *      item_code_mode  'manual' | 'auto'  (auto = next number from the
 *                      'product' numbering sequence, prefix/padding editable
 *                      in Settings › Numbering)
 *      barcode_mode    'manual' | 'auto'  (auto = an internal EAN-13 is
 *                      generated when a variant is saved without one)
 *      barcode_prefix  leading digits of generated EAN-13s. Default '2':
 *                      GS1 reserves 20–29 for in-store/internal numbering,
 *                      so generated codes never collide with real
 *                      manufacturer barcodes.
 *  - product_categories: a tree (parent_id), deleted only when unused.
 *  - product_brands: flat list.
 *  - products gain: item_type ('stock' moves inventory, 'service' never
 *    does), category, brand, default sale/purchase price (Money: amount in
 *    minor units + currency, both set or both NULL), default tax rule.
 *
 * Every new products column is nullable or defaulted, so existing rows
 * stay valid with no backfill.
 */
const migration: TenantMigration = {
  name: '0075_product_master_data',
  async up(db) {
    await sql`
      CREATE TABLE inventory_settings (
        id UUID PRIMARY KEY,
        singleton BOOLEAN NOT NULL DEFAULT true UNIQUE CHECK (singleton),
        item_code_mode TEXT NOT NULL DEFAULT 'manual' CHECK (item_code_mode IN ('manual', 'auto')),
        barcode_mode TEXT NOT NULL DEFAULT 'manual' CHECK (barcode_mode IN ('manual', 'auto')),
        barcode_prefix TEXT NOT NULL DEFAULT '2' CHECK (barcode_prefix ~ '^[0-9]{1,7}$'),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`
      INSERT INTO inventory_settings (id) VALUES (gen_random_uuid())
    `.execute(db);

    await sql`
      CREATE TABLE product_categories (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id UUID REFERENCES product_categories(id) ON DELETE RESTRICT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT product_categories_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
      )
    `.execute(db);
    await sql`
      CREATE UNIQUE INDEX product_categories_parent_name_uidx
        ON product_categories (
          COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
          lower(name)
        )
    `.execute(db);

    await sql`
      CREATE TABLE product_brands (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX product_brands_name_uidx ON product_brands (lower(name))`.execute(db);

    await sql`
      ALTER TABLE products
        ADD COLUMN item_type TEXT NOT NULL DEFAULT 'stock' CHECK (item_type IN ('stock', 'service')),
        ADD COLUMN category_id UUID REFERENCES product_categories(id) ON DELETE RESTRICT,
        ADD COLUMN brand_id UUID REFERENCES product_brands(id) ON DELETE RESTRICT,
        ADD COLUMN sale_price_amount BIGINT,
        ADD COLUMN sale_price_currency TEXT,
        ADD COLUMN purchase_price_amount BIGINT,
        ADD COLUMN purchase_price_currency TEXT,
        ADD COLUMN tax_rule_id UUID REFERENCES tax_rules(id) ON DELETE RESTRICT,
        ADD CONSTRAINT products_sale_price_pair CHECK ((sale_price_amount IS NULL) = (sale_price_currency IS NULL)),
        ADD CONSTRAINT products_purchase_price_pair
          CHECK ((purchase_price_amount IS NULL) = (purchase_price_currency IS NULL)),
        ADD CONSTRAINT products_prices_non_negative
          CHECK (COALESCE(sale_price_amount, 0) >= 0 AND COALESCE(purchase_price_amount, 0) >= 0)
    `.execute(db);
    await sql`CREATE INDEX products_category_idx ON products (category_id)`.execute(db);
    await sql`CREATE INDEX products_brand_idx ON products (brand_id)`.execute(db);
  },
};

export default migration;
