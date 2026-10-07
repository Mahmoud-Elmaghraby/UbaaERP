import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Cost accuracy (inventory completion, item 3).
 *
 *  - stock_levels.inventory_value_amount: the location's total stock value
 *    in minor units. Weighted-average costing used to keep only a per-unit
 *    average rounded to the piastre, so cheap items lost value on every
 *    movement (0.333 EGP/g stored as 0.33 → 1,000 g sold at 330, not 333)
 *    and the stock value drifted from the books. Now the total value is the
 *    source of truth: an outgoing movement takes value × qty / on-hand
 *    (rounded once), emptying a location takes exactly what is left, and
 *    the per-unit average is only a display figure. Backfilled from the old
 *    average.
 *  - stock_movements.total_cost_amount: the exact value a movement added or
 *    took (in the movement's cost currency) — what COGS and the item card
 *    use instead of unit cost × quantity.
 *  - goods_receipts.exchange_rate: tenant-currency units per 1 unit of the
 *    purchase order's currency, frozen when a foreign-currency receipt is
 *    confirmed (typed by the user, else the effective rate on the receipt
 *    date) — so stock is valued in the tenant's currency (audit H2).
 *  - landed_cost_allocations.expensed_amount: the part of a landed cost
 *    whose goods were already sold — it can no longer raise a stock value,
 *    so it goes to cost of goods sold instead of being refused or
 *    overstating the stock still on hand.
 */
const migration: TenantMigration = {
  name: '0081_inventory_value_and_fx',
  async up(db) {
    await sql`ALTER TABLE stock_levels ADD COLUMN inventory_value_amount BIGINT NOT NULL DEFAULT 0`.execute(db);
    await sql`
      UPDATE stock_levels
         SET inventory_value_amount = ROUND(GREATEST(quantity_on_hand, 0) * average_cost_amount)::bigint
    `.execute(db);
    await sql`ALTER TABLE stock_movements ADD COLUMN total_cost_amount BIGINT`.execute(db);
    await sql`
      UPDATE stock_movements
         SET total_cost_amount = ROUND(quantity * COALESCE(unit_cost_amount, resulting_average_cost_amount))::bigint
    `.execute(db);
    await sql`
      ALTER TABLE landed_cost_allocations ADD COLUMN expensed_amount BIGINT NOT NULL DEFAULT 0
    `.execute(db);
    await sql`ALTER TABLE goods_receipts ADD COLUMN exchange_rate NUMERIC(18, 8) CHECK (exchange_rate > 0)`.execute(db);
  },
};

export default migration;
