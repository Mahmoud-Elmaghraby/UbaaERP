import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Price lists (قوائم الأسعار): wholesale, retail, distributors… for any
 * activity, not one trade. A list has a currency and an optional general
 * discount % off the item's normal sale price; its items set a fixed price
 * for a product (all its variants) or one variant, optionally from a
 * minimum quantity (quantity breaks). Resolution order lives in one place
 * on the client (components/product/sale-pricing.ts):
 *   variant item → product item → list discount % → normal price.
 *
 * A customer may have a default list (NULL = normal prices); documents and
 * POS pick it up when the customer is chosen and the user may switch it.
 * Pricing only — no ledger effect, no new financial flow.
 */
const migration: TenantMigration = {
  name: '0102_price_lists',
  async up(db) {
    await sql`
      CREATE TABLE price_lists (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        currency TEXT NOT NULL,
        discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0
          CHECK (discount_percent >= 0 AND discount_percent <= 100),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX price_lists_name_uq ON price_lists (lower(name))`.execute(db);

    await sql`
      CREATE TABLE price_list_items (
        id UUID PRIMARY KEY,
        price_list_id UUID NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        product_variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
        min_quantity NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
        price_amount BIGINT NOT NULL CHECK (price_amount >= 0)
      )
    `.execute(db);
    // One price per (list, product or variant, quantity break). COALESCE so a
    // product-wide row (variant NULL) is unique too, on any Postgres version.
    await sql`
      CREATE UNIQUE INDEX price_list_items_uq ON price_list_items (
        price_list_id, product_id,
        COALESCE(product_variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        min_quantity
      )
    `.execute(db);

    await sql`
      ALTER TABLE customers
        ADD COLUMN price_list_id UUID REFERENCES price_lists(id) ON DELETE RESTRICT
    `.execute(db);
  },
};

export default migration;
