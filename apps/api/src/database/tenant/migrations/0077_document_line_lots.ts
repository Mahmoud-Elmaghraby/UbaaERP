import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Lots / expiry / serials on documents (inventory step "lots & expiry").
 *
 * Until now a lot- or serial-tracked item could not enter stock from a
 * goods receipt at all (the receipt carried no lot number, Inventory's
 * listener refused the movement) — the core gap for pharmaceuticals,
 * medical devices and animal feed.
 *
 *  - goods_receipt_lines.lot_allocations: how the received quantity splits
 *    across lots/serials: [{ "lotNumber", "expiryDate" (YYYY-MM-DD|null),
 *    "quantity" }]. Required (sum = quantity received) for tracked items,
 *    empty for untracked ones.
 *  - delivery_lines.lot_allocations: OPTIONAL explicit picks:
 *    [{ "lotNumber", "quantity" }]. Empty = Inventory picks the
 *    earliest-expiring non-expired lots automatically (FEFO).
 *
 * Returns need no column: Inventory resolves the lots of a return from the
 * stock movements of the original goods receipt / delivery it references.
 */
const migration: TenantMigration = {
  name: '0077_document_line_lots',
  async up(db) {
    await sql`ALTER TABLE goods_receipt_lines ADD COLUMN lot_allocations JSONB NOT NULL DEFAULT '[]'::jsonb`.execute(
      db,
    );
    await sql`ALTER TABLE delivery_lines ADD COLUMN lot_allocations JSONB NOT NULL DEFAULT '[]'::jsonb`.execute(db);
    await sql`CREATE INDEX stock_lots_expiry_idx ON stock_lots (expiry_date) WHERE expiry_date IS NOT NULL`.execute(db);
  },
};

export default migration;
