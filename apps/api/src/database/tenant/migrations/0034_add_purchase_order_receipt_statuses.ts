import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Extends purchase_orders.status to add 'partially_received' and
 * 'fully_received', now that Goods Receipts (Stage 5) can actually
 * report what arrived against a purchase order. Migration 0032
 * deliberately left these out of the original CHECK constraint, calling
 * them "Goods Receipts' concern, not built yet" — this is that stage.
 *
 * A purchase order only reaches these two statuses via
 * GoodsReceiptsService.confirm() recomputing total received quantity
 * (across every confirmed goods receipt) against each line's ordered
 * quantity. Nothing else sets them.
 *
 * PurchaseOrdersService.cancel()'s `from` list stays ['draft',
 * 'confirmed'] — unchanged by this migration. Once any goods receipt is
 * confirmed against a PO, it can no longer be plain-cancelled; undoing a
 * partially- or fully-received order is a Purchase Returns / Debit Notes
 * concern (Stage 6, not built yet), not a plain status flip.
 */
const migration: TenantMigration = {
  name: '0034_add_purchase_order_receipt_statuses',
  async up(db) {
    await sql`ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_status_check`.execute(db);
    await sql`
      ALTER TABLE purchase_orders
      ADD CONSTRAINT purchase_orders_status_check
      CHECK (status IN ('draft', 'confirmed', 'partially_received', 'fully_received', 'cancelled'))
    `.execute(db);
  },
};

export default migration;
