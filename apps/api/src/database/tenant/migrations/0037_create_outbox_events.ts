import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * outbox_events (master doc §5/§2.7 [مستقر] — the Outbox Pattern).
 * Shared cross-cutting infrastructure, not owned by any one business
 * module — lives per tenant schema (like every other tenant table) so
 * that writing an outbox record can happen in the SAME DB transaction as
 * the business operation it accompanies (§2.7's core requirement),
 * using the same `trx` a service already has, no cross-schema
 * transaction needed.
 *
 * First used by Purchases' purchase_invoices (Stage 7 — posting an
 * invoice is this codebase's first genuinely financial event), but
 * designed to be reused by every future financial event (Sales invoice
 * confirmation, payments, Accounting postings, ...) — see
 * apps/api/src/shared/outbox/ for the writer/dispatcher code.
 *
 * Every prior Purchases stage's integration events (goods receipt
 * confirmed, purchase return confirmed) deliberately do NOT go through
 * this table — CLAUDE.md §2.7 scopes Outbox to financial events, and
 * those are inventory-quantity events, not ledger postings; they stay on
 * the plain Event Bus (EventEmitter2), a decision flagged explicitly in
 * claude/purchases-module-status.md's Stage 5/6 write-ups.
 *
 * `attempts`/`last_error` support the dispatcher's simple retry-with-cap
 * behavior (see OutboxDispatcherService) — no dead-letter table yet;
 * a row that exhausts its attempts is marked 'failed' and logged loudly
 * for manual intervention rather than retried forever.
 */
const migration: TenantMigration = {
  name: '0037_create_outbox_events',
  async up(db) {
    await sql`
      CREATE TABLE outbox_events (
        id UUID PRIMARY KEY,
        event_type TEXT NOT NULL,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        processed_at TIMESTAMPTZ
      )
    `.execute(db);

    await sql`CREATE INDEX outbox_events_status_created_at_idx ON outbox_events (status, created_at)`.execute(db);
  },
};

export default migration;
