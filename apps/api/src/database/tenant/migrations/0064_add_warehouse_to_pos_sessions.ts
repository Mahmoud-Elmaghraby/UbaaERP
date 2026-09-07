import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * POS feature Stage 3 (see claude/sales-pos-research.md) — adds the
 * warehouse a POS session's checkouts deliver stock from.
 *
 * Decided via explicit user confirmation (not an architectural
 * assumption on my part): the warehouse is resolved ONCE PER SESSION,
 * at open time — not per checkout, and not derived from
 * user_branch_access. A cashier opens a session against one warehouse
 * and every checkout during that session delivers from it.
 *
 * Nullable at the DB level, same "nullable column ahead of the stage
 * that uses it" precedent as eta_credentials and payments_received.
 * pos_session_id (migration 0060): PosSessionsService.open() will
 * require warehouseId in practice (application-level validation), but
 * the column stays nullable so a hypothetical future session type that
 * never delivers stock (there isn't one yet) isn't blocked by a NOT
 * NULL constraint added prematurely.
 *
 * ON DELETE RESTRICT, same treatment as deliveries.warehouse_id
 * (migration 0044) and cashier_user_id on this same table — a session
 * is a historical record of what happened at a specific warehouse; the
 * warehouse row must be dealt with explicitly before it can be deleted.
 */
const migration: TenantMigration = {
  name: '0064_add_warehouse_to_pos_sessions',
  async up(db) {
    await sql`
      ALTER TABLE pos_sessions
        ADD COLUMN warehouse_id UUID REFERENCES warehouses (id) ON DELETE RESTRICT
    `.execute(db);

    await sql`CREATE INDEX pos_sessions_warehouse_id_idx ON pos_sessions (warehouse_id)`.execute(db);
  },
};

export default migration;
