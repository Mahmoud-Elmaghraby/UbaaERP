import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * outbox_events.claimed_at: when the dispatcher flipped a row to
 * 'processing'. Before this, a row claimed by a process that then died
 * (a restart mid-dispatch) stayed 'processing' forever — its stock
 * movement / journal entry silently never happened. The dispatcher now
 * re-claims 'processing' rows whose claim is older than a few minutes
 * (every listener is idempotent, so a second delivery is harmless).
 * Existing 'processing' rows get claimed_at = created_at so they are
 * recovered on the first tick after this migration.
 */
const migration: TenantMigration = {
  name: '0080_outbox_claimed_at',
  async up(db) {
    await sql`ALTER TABLE outbox_events ADD COLUMN claimed_at TIMESTAMPTZ`.execute(db);
    await sql`UPDATE outbox_events SET claimed_at = created_at WHERE status = 'processing'`.execute(db);
  },
};

export default migration;
