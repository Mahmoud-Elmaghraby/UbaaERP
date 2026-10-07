import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Outbox retries with exponential back-off. Before, a failing event was
 * retried every 5 seconds and marked 'failed' for good after 10 attempts —
 * under a minute. A cause that needs a person (no fiscal year yet, an
 * account mapping missing, stock not received yet) never had a chance to be
 * fixed in time. Now attempt n waits min(10 s × 2^n, 1 h): roughly four
 * hours of retries before the row shows as failed (and the manual retry in
 * Settings › Background operations still works at any time).
 */
const migration: TenantMigration = {
  name: '0087_outbox_backoff',
  async up(db) {
    await sql`ALTER TABLE outbox_events ADD COLUMN next_attempt_at TIMESTAMPTZ`.execute(db);
    await sql`CREATE INDEX outbox_events_pending_idx ON outbox_events (status, next_attempt_at)`.execute(db);
  },
};

export default migration;
