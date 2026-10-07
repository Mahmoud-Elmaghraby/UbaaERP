import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Selling and buying in more than one unit (inventory step 3b part 2).
 *
 *  - product_units: the extra units ONE product is traded in, each with its
 *    own factor = how many base units (products.unit_of_measure_id) it
 *    holds — a carton of 12 for this product, of 24 for another, a 50 kg
 *    sack of feed, a box of 3 strips of tablets. Optional own sale /
 *    purchase price (else base price × factor). The base unit itself is
 *    implicit (factor 1) and never stored here.
 *  - Every quantity-carrying document line gets unit_of_measure_id (NULL =
 *    the product's base unit) and unit_factor (base units per 1 line unit,
 *    frozen at creation). Quantities and prices on a line stay in the line's
 *    unit; Inventory receives quantity × unit_factor. Downstream documents
 *    (delivery, receipt, invoice, returns, credit notes) copy the unit of
 *    the order line they come from, so every "remaining quantity" check
 *    still compares like with like.
 */
const LINE_TABLES = [
  'quotation_lines',
  'sales_order_lines',
  'delivery_lines',
  'sales_invoice_lines',
  'sales_return_lines',
  'sales_credit_note_lines',
  'supplier_quotation_lines',
  'purchase_order_lines',
  'goods_receipt_lines',
  'purchase_invoice_lines',
  'purchase_return_lines',
] as const;

const migration: TenantMigration = {
  name: '0079_product_units',
  async up(db) {
    await sql`
      CREATE TABLE product_units (
        id UUID PRIMARY KEY,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        unit_of_measure_id UUID NOT NULL REFERENCES units_of_measure(id) ON DELETE RESTRICT,
        factor NUMERIC(18, 6) NOT NULL CHECK (factor > 0),
        sale_price_amount BIGINT CHECK (sale_price_amount >= 0),
        sale_price_currency TEXT,
        purchase_price_amount BIGINT CHECK (purchase_price_amount >= 0),
        purchase_price_currency TEXT,
        is_default_sale BOOLEAN NOT NULL DEFAULT false,
        is_default_purchase BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT product_units_unique UNIQUE (product_id, unit_of_measure_id),
        CONSTRAINT product_units_sale_price_pair CHECK ((sale_price_amount IS NULL) = (sale_price_currency IS NULL)),
        CONSTRAINT product_units_purchase_price_pair CHECK ((purchase_price_amount IS NULL) = (purchase_price_currency IS NULL))
      )
    `.execute(db);
    await sql`CREATE UNIQUE INDEX product_units_default_sale_uidx ON product_units (product_id) WHERE is_default_sale`.execute(
      db,
    );
    await sql`CREATE UNIQUE INDEX product_units_default_purchase_uidx ON product_units (product_id) WHERE is_default_purchase`.execute(
      db,
    );

    for (const table of LINE_TABLES) {
      await sql`
        ALTER TABLE ${sql.table(table)}
          ADD COLUMN unit_of_measure_id UUID REFERENCES units_of_measure(id) ON DELETE RESTRICT,
          ADD COLUMN unit_factor NUMERIC(18, 6) NOT NULL DEFAULT 1 CHECK (unit_factor > 0)
      `.execute(db);
    }
  },
};

export default migration;
