import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * stock_movements.movement_date — the business date of a stock movement (the date on the
 * document that moved the stock), next to created_at (when it was recorded). Stock reports
 * (stock as of a date, item card, slow movers, lot history) read movement_date, so a delivery
 * or receipt entered late lands on its own date — the same date its journal entry already uses.
 *
 * Existing rows take their document's date where the document has one, otherwise the Cairo
 * calendar date of created_at. Weighted-average cost stays in recording order (created_at);
 * movement_date never re-costs anything.
 */
const migration: TenantMigration = {
  name: '0129_stock_movement_date',
  up: async (db) => {
    await sql`ALTER TABLE stock_movements ADD COLUMN movement_date DATE`.execute(db);

    await sql`
      UPDATE stock_movements m SET movement_date = d.delivery_date
        FROM deliveries d
       WHERE m.reference_type = 'delivery' AND m.reference_id = d.id AND d.delivery_date IS NOT NULL
    `.execute(db);
    await sql`
      UPDATE stock_movements m SET movement_date = g.received_date
        FROM goods_receipts g
       WHERE m.reference_type = 'goods_receipt' AND m.reference_id = g.id AND g.received_date IS NOT NULL
    `.execute(db);
    await sql`
      UPDATE stock_movements m SET movement_date = r.return_date
        FROM sales_returns r
       WHERE m.reference_type = 'sales_return' AND m.reference_id = r.id AND r.return_date IS NOT NULL
    `.execute(db);
    await sql`
      UPDATE stock_movements m SET movement_date = r.return_date
        FROM purchase_returns r
       WHERE m.reference_type = 'purchase_return' AND m.reference_id = r.id AND r.return_date IS NOT NULL
    `.execute(db);
    await sql`
      UPDATE stock_movements m SET movement_date = a.adjustment_date
        FROM stock_adjustments a
       WHERE m.reference_type = 'stock_adjustment' AND m.reference_id = a.id
    `.execute(db);
    await sql`
      UPDATE stock_movements m SET movement_date = c.count_date
        FROM stock_counts c
       WHERE m.reference_type IN ('stock_count', 'opening_balance') AND m.reference_id = c.id
         AND c.count_date IS NOT NULL
    `.execute(db);
    // Transfers: the dispatch leg on the transfer date, and so is an arrival recorded in the same
    // step (posted as a same-day move). A later arrival or a cancellation stays on the day it was
    // recorded (the fallback below).
    await sql`
      UPDATE stock_movements m SET movement_date = t.transfer_date
        FROM stock_transfers t
       WHERE m.reference_type = 'stock_transfer' AND m.reference_id = t.id AND m.movement_type = 'transfer_out'
    `.execute(db);
    await sql`
      UPDATE stock_movements m SET movement_date = t.transfer_date
        FROM stock_transfers t
       WHERE m.reference_type = 'stock_transfer' AND m.reference_id = t.id AND m.movement_type = 'transfer_in'
         AND EXISTS (
           SELECT 1 FROM stock_movements o
            WHERE o.reference_type = 'stock_transfer' AND o.reference_id = t.id AND o.movement_type = 'transfer_out'
              AND o.created_at BETWEEN m.created_at - interval '1 minute' AND m.created_at
         )
    `.execute(db);

    await sql`
      UPDATE stock_movements SET movement_date = (created_at AT TIME ZONE 'Africa/Cairo')::date
       WHERE movement_date IS NULL
    `.execute(db);

    await sql`ALTER TABLE stock_movements ALTER COLUMN movement_date SET NOT NULL`.execute(db);
    await sql`ALTER TABLE stock_movements ALTER COLUMN movement_date SET DEFAULT CURRENT_DATE`.execute(db);
    await sql`CREATE INDEX stock_movements_movement_date_idx ON stock_movements (movement_date, created_at)`.execute(
      db,
    );
  },
};

export default migration;
