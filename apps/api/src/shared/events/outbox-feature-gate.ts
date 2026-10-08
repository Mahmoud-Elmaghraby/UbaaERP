import type { FeatureKey } from '../plans/feature-catalog';

/**
 * CLAUDE.md §2.6: "If a module is not enabled for a given tenant, its
 * events simply have no listener." Listeners are registered once for the
 * whole process, so "no listener" per tenant is enforced at delivery time:
 * a handler declared with `@OnOutboxEvent(event, { requiresFeature })`
 * becomes a no-op for any tenant where that feature is off (Plan ceiling
 * or Settings › Modules toggle) — the outbox row is still marked processed.
 *
 * Found 2026-10-08: with Accounting switched off, every invoice/payment
 * still reached the accounting listeners, which either posted journal
 * entries nobody asked for or failed on missing account mappings and
 * retried forever.
 *
 * The checker is registered once at boot (OutboxFeatureGateRegistrar, in
 * PlansModule). Unregistered (plain unit tests constructing a listener
 * directly) means "enabled" — the handler runs as it always did.
 */
export interface OutboxFeatureChecker {
  isEnabledForSchema(schema: string, featureKey: FeatureKey): Promise<boolean>;
}

let checker: OutboxFeatureChecker | null = null;

export function registerOutboxFeatureChecker(next: OutboxFeatureChecker | null): void {
  checker = next;
}

export function isOutboxFeatureEnabled(schema: string, featureKey: FeatureKey): Promise<boolean> {
  return checker ? checker.isEnabledForSchema(schema, featureKey) : Promise.resolve(true);
}
