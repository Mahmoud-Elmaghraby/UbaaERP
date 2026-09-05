import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { CreateOutboxEventInput, OutboxEvent } from '../../domain/outbox-event.entity';

export interface OutboxEventRepository {
  create(db: Kysely<TenantDatabase>, input: CreateOutboxEventInput): Promise<OutboxEvent>;
  /**
   * Atomically claims up to `limit` pending rows (oldest first) by
   * flipping them to 'processing' and returning them in one statement —
   * `SELECT ... FOR UPDATE SKIP LOCKED` under an UPDATE, so two
   * dispatcher instances polling the same tenant concurrently (e.g. a
   * horizontally-scaled API) never claim the same row twice, with no
   * separate locking service needed. Safe today even though this
   * codebase only runs one API instance — see OutboxDispatcherService's
   * class comment.
   */
  claimPending(db: Kysely<TenantDatabase>, limit: number): Promise<OutboxEvent[]>;
  markProcessed(db: Kysely<TenantDatabase>, id: string): Promise<void>;
  /** Increments attempts and records the error; status becomes 'failed' once attempts reaches maxAttempts, else back to 'pending' for a later retry. */
  markFailedAttempt(
    db: Kysely<TenantDatabase>,
    id: string,
    error: string,
    maxAttempts: number,
  ): Promise<void>;
}

export const OUTBOX_EVENT_REPOSITORY = Symbol('OUTBOX_EVENT_REPOSITORY');
