import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';

/**
 * Thin wrapper around the Event Bus (EventEmitter2) for Accounting's own
 * plain CRUD/audit events (chart of accounts changes, fiscal year/period
 * lifecycle) — event name is always 'accounting.<entityType>.<action>',
 * mirroring PurchasesEventPublisher/SalesEventPublisher.
 *
 * This is NOT the mechanism Accounting uses to react to Sales/Purchases
 * (CLAUDE.md §2.6 — Accounting only ever listens, via @OnEvent, to
 * events those modules already publish through their own Outbox-backed
 * paths for financial events). This publisher is for events Accounting
 * itself emits about its own entities, same category as every other
 * module's plain CRUD events.
 */
@Injectable()
export class AccountingEventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  publish(
    entityType: string,
    action: string,
    input: { schema: string; entityId: string; actorUserId: string | null; metadata?: Record<string, unknown> },
  ): void {
    const payload: DomainEventPayload = {
      schema: input.schema,
      entityType,
      entityId: input.entityId,
      action,
      actorUserId: input.actorUserId,
      metadata: input.metadata,
      occurredAt: new Date(),
    };
    this.emitter.emit(`accounting.${entityType}.${action}`, payload);
  }
}
