import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Adds idempotency plumbing to journal_entries (CLAUDE.md §10 — step 5,
 * Accounting, Stage 6/7: auto-posting listeners). An @OnEvent listener
 * reacting to an Outbox-dispatched event (OutboxDispatcherService)
 * retries on any thrown error, up to MAX_ATTEMPTS — correct for
 * reliability, but it means the SAME source event can trigger the
 * listener more than once (a retry after a transient failure, or a
 * process restart mid-tick). Without a way to recognize "I already
 * created the journal entry for this exact source fact", a retry would
 * create a DUPLICATE entry — silently double-booking a financial
 * amount, exactly the kind of error class Outbox exists to prevent, not
 * introduce.
 *
 * source_reference_type/source_reference_id (e.g. 'delivery'/<deliveryId>,
 * 'sales_credit_note'/<creditNoteId>) are set only on auto-generated
 * entries (source = 'auto'); NULL for every manual entry, which needs no
 * such tracking. The partial UNIQUE index is the actual idempotency
 * mechanism — an auto-posting listener always tries to INSERT first and
 * treats a unique-violation as "already posted, nothing to do" (same
 * try-then-catch-and-re-read idiom as tenant_settings' own singleton
 * getOrCreate()), rather than a fragile check-then-insert that a
 * concurrent retry could still race.
 */
const migration: TenantMigration = {
  name: '0051_add_journal_entry_source_reference',
  async up(db) {
    await sql`ALTER TABLE journal_entries ADD COLUMN source_reference_type TEXT`.execute(db);
    await sql`ALTER TABLE journal_entries ADD COLUMN source_reference_id UUID`.execute(db);

    await sql`
      CREATE UNIQUE INDEX journal_entries_source_reference_unique
        ON journal_entries (source_reference_type, source_reference_id)
        WHERE source_reference_type IS NOT NULL AND source_reference_id IS NOT NULL
    `.execute(db);
  },
};

export default migration;
