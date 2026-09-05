import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Extends sales_orders.status to add 'partially_delivered' and
 * 'fully_delivered', now that Deliveries (Stage 4) can actually report
 * what shipped against a sales order — exact mirror of migration 0034
 * (Purchase Orders' equivalent extension once Goods Receipts existed).
 * Migration 0042 deliberately left these out of the original CHECK
 * constraint for the identical reason 0032 did on the Purchases side.
 *
 * A sales order only reaches these two statuses via
 * DeliveriesService.confirm() recomputing total delivered quantity
 * (across every confirmed delivery) against each line's ordered
 * quantity. Nothing else sets them.
 *
 * SalesOrdersService.cancel()'s `from` list stays ['draft', 'confirmed']
 * — unchanged by this migration, same reasoning as 0034: once any
 * delivery is confirmed against a sales order, undoing it is a Sales
 * Returns concern (proposed, not approved — claude/sales-module-research.md
 * — not a plain status flip), not something this migration decides.
 */
const migration: TenantMigration = {
  name: '0043_add_sales_order_delivery_statuses',
  async up(db) {
    await sql`ALTER TABLE sales_orders DROP CONSTRAINT sales_orders_status_check`.execute(db);
    await sql`
      ALTER TABLE sales_orders
      ADD CONSTRAINT sales_orders_status_check
      CHECK (status IN ('draft', 'confirmed', 'partially_delivered', 'fully_delivered', 'cancelled'))
    `.execute(db);
  },
};

export default migration;
