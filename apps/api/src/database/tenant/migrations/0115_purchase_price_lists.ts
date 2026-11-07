import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Supplier price lists (قوائم أسعار الموردين): the same price_lists / price_list_items tables
 * as sales lists (migration 0102), told apart by `kind`. A purchase list's general discount is
 * off the item's normal purchase price; a supplier may have a default list that purchase orders
 * and direct purchase invoices pick up. Names are unique per kind. Pricing only — no ledger
 * effect, no new financial flow.
 */
const migration: TenantMigration = {
  name: '0115_purchase_price_lists',
  async up(db) {
    await sql`
      ALTER TABLE price_lists
        ADD COLUMN kind TEXT NOT NULL DEFAULT 'sale' CHECK (kind IN ('sale', 'purchase'))
    `.execute(db);
    await sql`DROP INDEX price_lists_name_uq`.execute(db);
    await sql`CREATE UNIQUE INDEX price_lists_kind_name_uq ON price_lists (kind, lower(name))`.execute(db);
    await sql`
      ALTER TABLE suppliers
        ADD COLUMN price_list_id UUID REFERENCES price_lists(id) ON DELETE RESTRICT
    `.execute(db);
  },
};

export default migration;
