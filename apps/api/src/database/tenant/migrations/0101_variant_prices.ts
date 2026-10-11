import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * A variant's own prices (XXL dearer than S…). NULL = the product's price,
 * so one price for the whole model stays the default; documents pick the
 * variant's price first through the variant lookup.
 */
const migration: TenantMigration = {
  name: '0101_variant_prices',
  async up(db) {
    await sql`
      ALTER TABLE product_variants
        ADD COLUMN sale_price_amount BIGINT CHECK (sale_price_amount >= 0),
        ADD COLUMN sale_price_currency TEXT,
        ADD COLUMN purchase_price_amount BIGINT CHECK (purchase_price_amount >= 0),
        ADD COLUMN purchase_price_currency TEXT
    `.execute(db);
  },
};

export default migration;
