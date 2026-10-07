import { z } from 'zod';

/** A background operation (outbox event): stock movement, journal entry… that runs after a document is confirmed. */
export const outboxEventSchema = z.object({
  id: z.string().uuid(),
  eventType: z.string(),
  status: z.enum(['pending', 'processing', 'processed', 'failed']),
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type OutboxEventDto = z.infer<typeof outboxEventSchema>;

export const outboxSummarySchema = z.object({
  pending: z.number().int(),
  processing: z.number().int(),
  failed: z.number().int(),
});
export type OutboxSummaryDto = z.infer<typeof outboxSummarySchema>;
