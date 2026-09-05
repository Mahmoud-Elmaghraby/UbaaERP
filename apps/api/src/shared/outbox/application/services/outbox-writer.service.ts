import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { OUTBOX_EVENT_REPOSITORY, type OutboxEventRepository } from '../ports/outbox-event.repository';
import type { DomainEventPayload } from '../../../events/domain-event';

/**
 * The write side of the Outbox Pattern (master doc §5/§2.7 [مستقر]).
 * Callers pass the SAME `trx` they're already using for their business
 * write — that's the entire mechanism: this is one more INSERT inside
 * that transaction, so the outbox record and the business row either
 * both commit or neither does. There is deliberately no "publish now"
 * option here; that's OutboxDispatcherService's job, on its own schedule,
 * reading rows this service wrote.
 *
 * `event.occurredAt` is serialized as an ISO string in the JSONB payload
 * (Postgres JSONB has no native Date type) — OutboxDispatcherService
 * revives it back to a Date before re-emitting on the Event Bus, so a
 * listener sees the exact same DomainEventPayload shape whether the
 * event arrived via this path or the plain post-commit
 * PurchasesEventPublisher path every non-financial event still uses.
 */
@Injectable()
export class OutboxWriterService {
  constructor(@Inject(OUTBOX_EVENT_REPOSITORY) private readonly repository: OutboxEventRepository) {}

  async write(db: Kysely<TenantDatabase>, eventType: string, event: DomainEventPayload): Promise<void> {
    await this.repository.create(db, {
      eventType,
      payload: { ...event, occurredAt: event.occurredAt.toISOString() },
    });
  }
}
