import { OnEvent } from '@nestjs/event-emitter';

/**
 * Use for EVERY listener of an outbox-delivered event (anything written with
 * OutboxWriterService). Plain @OnEvent defaults to `suppressErrors: true`:
 * @nestjs/event-emitter catches the listener's error, logs it and resolves
 * — so OutboxDispatcherService's emitAsync() never saw a failure and marked
 * the event processed. A delivery that could not move stock, or a journal
 * entry that could not be posted, was silently lost and never retried (found
 * 2026-10-08 while verifying inventory step 4 end to end: every automatic
 * journal entry of a new tenant failed and every row still said
 * "processed"). With errors propagating, the dispatcher retries and finally
 * shows the row as failed in Settings › Background operations.
 */
export const OnOutboxEvent = (event: string): MethodDecorator => OnEvent(event, { suppressErrors: false });
