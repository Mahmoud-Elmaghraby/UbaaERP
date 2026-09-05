/**
 * Outbox Pattern (master doc §5/§2.7 [مستقر]). A row here is a promise:
 * "this event happened, atomically with the business write that created
 * this row" — see migration 0037's class comment for the full reasoning
 * and shared/events/domain-event.ts for how this relates to the plain
 * (non-Outbox) Event Bus every earlier Purchases stage uses.
 */
export type OutboxEventStatus = 'pending' | 'processing' | 'processed' | 'failed';

export interface OutboxEvent {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: OutboxEventStatus;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

export interface CreateOutboxEventInput {
  eventType: string;
  payload: Record<string, unknown>;
}
