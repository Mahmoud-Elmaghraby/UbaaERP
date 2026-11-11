import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Price lists, part 2 (clothing client: one price on Amazon / Jumia, another for the walk-in
 * customer, wholesale vs retail):
 *
 * - price_lists.adjust_percent: one SIGNED adjustment of the normal price for items without a
 *   fixed price — negative = a discount (what discount_percent was), positive = a markup (an
 *   online channel priced above the shop). Range −100 … +1000. Existing lists keep their exact
 *   prices: adjust = −discount. discount_percent stays in place, no longer read.
 * - price_list_category_rules: a % per category (a season sale on one category, a higher markup
 *   on another). A rule covers its sub-categories unless they have their own. Resolution:
 *   variant price → product price → category rule → list adjust → normal price.
 */
const migration: TenantMigration = {
  name: '0122_price_list_adjust_and_categories',
  async up(db) {
    await sql`
      ALTER TABLE price_lists
        ADD COLUMN adjust_percent NUMERIC(6,2) NOT NULL DEFAULT 0
          CHECK (adjust_percent >= -100 AND adjust_percent <= 1000)
    `.execute(db);
    await sql`UPDATE price_lists SET adjust_percent = -discount_percent WHERE discount_percent <> 0`.execute(db);
    await sql`
      CREATE TABLE price_list_category_rules (
        id UUID PRIMARY KEY,
        price_list_id UUID NOT NULL REFERENCES price_lists (id) ON DELETE CASCADE,
        category_id UUID NOT NULL REFERENCES product_categories (id) ON DELETE CASCADE,
        adjust_percent NUMERIC(6,2) NOT NULL CHECK (adjust_percent >= -100 AND adjust_percent <= 1000),
        UNIQUE (price_list_id, category_id)
      )
    `.execute(db);
  },
};

export default migration;
