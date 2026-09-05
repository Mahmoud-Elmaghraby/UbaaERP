import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Adds the join point PosSessionsService.close() needs (migration
 * 0059's own comment) to compute expected_cash_amount from real cash
 * tenders — nullable, ON DELETE SET NULL like every other optional
 * linking FK in this schema (e.g. accounting_settings' mappings).
 * Unused by any write path until Stage 3's PosSalesService.checkout()
 * orchestration exists and starts tagging the payments it records with
 * the active session's id — added now, ahead of that stage, same
 * "prepare the join point early" precedent as eta_credentials (see
 * sales.module.ts's own comment on why that was built ahead of its
 * natural stage).
 */
const migration: TenantMigration = {
  name: '0060_add_pos_session_id_to_payments_received',
  async up(db) {
    await sql`
      ALTER TABLE payments_received
        ADD COLUMN pos_session_id UUID REFERENCES pos_sessions (id) ON DELETE SET NULL
    `.execute(db);

    await sql`CREATE INDEX payments_received_pos_session_id_idx ON payments_received (pos_session_id)`.execute(db);
  },
};

export default migration;
