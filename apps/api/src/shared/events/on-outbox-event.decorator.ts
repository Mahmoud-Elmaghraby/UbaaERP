import { OnEvent } from '@nestjs/event-emitter';
import type { FeatureKey } from '../plans/feature-catalog';
import { isOutboxFeatureEnabled } from './outbox-feature-gate';

export interface OnOutboxEventOptions {
  /**
   * The handler belongs to an optional module: it runs only for tenants
   * that have this feature enabled, and is skipped (event still marked
   * processed) for everyone else — see outbox-feature-gate.ts.
   */
  requiresFeature?: FeatureKey;
}

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
export const OnOutboxEvent =
  (event: string, options: OnOutboxEventOptions = {}): MethodDecorator =>
  (target, propertyKey, descriptor: PropertyDescriptor) => {
    const featureKey = options.requiresFeature;
    if (featureKey) {
      const handler = descriptor.value as (payload: { schema: string }, ...rest: unknown[]) => unknown;
      descriptor.value = async function gatedOutboxHandler(this: unknown, payload: { schema: string }, ...rest: unknown[]) {
        if (!(await isOutboxFeatureEnabled(payload.schema, featureKey))) return undefined;
        return handler.apply(this, [payload, ...rest]);
      };
      Object.defineProperty(descriptor.value, 'name', { value: handler.name });
    }
    // Applied after the swap, so the listener metadata lands on the function that actually runs.
    return OnEvent(event, { suppressErrors: false })(target, propertyKey, descriptor);
  };
