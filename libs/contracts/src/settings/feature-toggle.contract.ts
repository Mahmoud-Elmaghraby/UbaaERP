import { z } from 'zod';

/**
 * Layer 2 of the platform-flexibility design
 * (claude/platform-flexibility-strategy.md): one row per feature key in
 * the catalog (shared/plans/feature-catalog.ts), combining Layer 1
 * (grantedByPlan — the commercial ceiling, read-only from this screen)
 * with Layer 2 (enabled — the tenant's own toggle, writable via
 * updateFeatureToggleSchema). Frontend owns the human-readable label per
 * featureKey (i18n-ready, per master doc) — this contract carries only
 * the key.
 */
export const featureToggleSchema = z.object({
  featureKey: z.string().min(1),
  grantedByPlan: z.boolean(),
  enabled: z.boolean(),
  updatedAt: z.coerce.date().nullable(),
});
export type FeatureToggleDto = z.infer<typeof featureToggleSchema>;

export const updateFeatureToggleSchema = z.object({
  enabled: z.boolean(),
});
export type UpdateFeatureToggleDto = z.infer<typeof updateFeatureToggleSchema>;
