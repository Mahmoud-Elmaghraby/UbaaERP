import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';

/**
 * Thin wrapper around the Event Bus (EventEmitter2) for Sales'
 * integration events — event name is always 'sales.<entityType>.<action>'
 * (e.g. 'sales.customer.created'). Mirrors PurchasesEventPublisher.
 *
 * Covers plain CRUD/audit events only, same as PurchasesEventPublisher
 * did before Purchase Invoices. Sales Invoice posting is a financial
 * event (CLAUDE.md §2.7) and will go through OutboxWriterService
 * instead, not this publisher — added when that stage is built.
 */
@Injectable()
export class SalesEventPublisher {
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
    this.emitter.emit(`sales.${entityType}.${action}`, payload);
  }
}
