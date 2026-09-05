import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Kysely, Selectable } from 'kysely';
import type { OutboxEventsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { OutboxEventRepository } from '../../application/ports/outbox-event.repository';
import type { CreateOutboxEventInput, OutboxEvent, OutboxEventStatus } from '../../domain/outbox-event.entity';

function toDomain(row: Selectable<OutboxEventsTable>): OutboxEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: row.status as OutboxEventStatus,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    processedAt: row.processed_at,
  };
}

export class KyselyOutboxEventRepository implements OutboxEventRepository {
  async create(db: Kysely<TenantDatabase>, input: CreateOutboxEventInput): Promise<OutboxEvent> {
    const row = await db
      .insertInto('outbox_events')
      .values({
        id: randomUUID(),
        event_type: input.eventType,
        payload: JSON.stringify(input.payload),
        status: 'pending',
        attempts: 0,
        last_error: null,
        processed_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async claimPending(db: Kysely<TenantDatabase>, limit: number): Promise<OutboxEvent[]> {
    // Single atomic UPDATE ... RETURNING built on a FOR UPDATE SKIP LOCKED
    // subselect: two dispatcher instances polling the same tenant schema
    // concurrently can never claim the same row (see the repository
    // port's method comment for why this matters even with one instance
    // today).
    const result = await sql<Selectable<OutboxEventsTable>>`
      UPDATE outbox_events
      SET status = 'processing'
      WHERE id IN (
        SELECT id FROM outbox_events
        WHERE status = 'pending'
        ORDER BY created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `.execute(db);

    return result.rows.map(toDomain);
  }

  async markProcessed(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await db
      .updateTable('outbox_events')
      .set({ status: 'processed', processed_at: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async markFailedAttempt(
    db: Kysely<TenantDatabase>,
    id: string,
    error: string,
    maxAttempts: number,
  ): Promise<void> {
    await sql`
      UPDATE outbox_events
      SET
        attempts = attempts + 1,
        last_error = ${error},
        status = CASE WHEN attempts + 1 >= ${maxAttempts} THEN 'failed' ELSE 'pending' END
      WHERE id = ${id}
    `.execute(db);
  }
}
