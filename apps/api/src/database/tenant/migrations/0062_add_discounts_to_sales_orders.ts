import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Discounts (POS feature Stage 2, CLAUDE.md §10 — step 4, Sales — POS;
 * see claude/sales-pos-research.md's "Discounts" section). Applies to
 * the full B2B Sales Order flow too, not just POS — POS is simply the
 * primary UI driving it initially (Stage 4, not built yet).
 *
 * Both header (sales_orders) and line (sales_order_lines) get the same
 * three columns: discount_type ('percentage'|'fixed'|NULL — NULL means
 * no discount), discount_percentage (NUMERIC(6,3), same convention as
 * tax_rules.rate — a percentage is not a Money VO concern), and
 * discount_fixed_amount (BIGINT minor units — IS a Money VO concern
 * once reconstructed at the repository layer). The consistency CHECK on
 * each table enforces exactly one of "no discount" / "percentage set,
 * fixed unset" / "fixed set, percentage unset" — same style as
 * journal_entry_lines_exactly_one_side (migration 0050).
 *
 * sales_orders also gains a plain `currency` column. Every line already
 * carries its own unit_price_currency, and SalesOrdersService.create()
 * already enforces (assertSingleCurrency) that all of an order's lines
 * share one currency — but nothing on the header row itself previously
 * recorded what that currency IS. A header-level discount_fixed_amount
 * needs a currency to become a Money value at the repository layer
 * (KyselySalesOrderRepository.toDomain() has no join to the order's
 * lines to derive it from), so this column makes that fact explicit
 * or the header level would have no way to represent a fixed discount.
 * Populated once at creation time from the order's own lines; nullable
 * because every ROW created before this migration has no known value
 * (harmless — none of them can have a discount_fixed_amount either,
 * since that column is new too).
 */
const migration: TenantMigration = {
  name: '0062_add_discounts_to_sales_orders',
  async up(db) {
    await sql`
      ALTER TABLE sales_orders
        ADD COLUMN currency TEXT,
        ADD COLUMN discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')),
        ADD COLUMN discount_percentage NUMERIC(6,3),
        ADD COLUMN discount_fixed_amount BIGINT,
        ADD CONSTRAINT sales_orders_discount_consistency CHECK (
          (discount_type IS NULL AND discount_percentage IS NULL AND discount_fixed_amount IS NULL)
          OR (discount_type = 'percentage' AND discount_percentage IS NOT NULL AND discount_fixed_amount IS NULL
              AND discount_percentage >= 0 AND discount_percentage <= 100)
          OR (discount_type = 'fixed' AND discount_fixed_amount IS NOT NULL AND discount_percentage IS NULL
              AND discount_fixed_amount >= 0)
        ),
        ADD CONSTRAINT sales_orders_discount_fixed_requires_currency CHECK (
          discount_fixed_amount IS NULL OR currency IS NOT NULL
        )
    `.execute(db);

    await sql`
      ALTER TABLE sales_order_lines
        ADD COLUMN discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')),
        ADD COLUMN discount_percentage NUMERIC(6,3),
        ADD COLUMN discount_fixed_amount BIGINT,
        ADD CONSTRAINT sales_order_lines_discount_consistency CHECK (
          (discount_type IS NULL AND discount_percentage IS NULL AND discount_fixed_amount IS NULL)
          OR (discount_type = 'percentage' AND discount_percentage IS NOT NULL AND discount_fixed_amount IS NULL
              AND discount_percentage >= 0 AND discount_percentage <= 100)
          OR (discount_type = 'fixed' AND discount_fixed_amount IS NOT NULL AND discount_percentage IS NULL
              AND discount_fixed_amount >= 0)
        )
    `.execute(db);
  },
};

export default migration;
