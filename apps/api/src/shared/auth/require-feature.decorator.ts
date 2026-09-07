import { SetMetadata } from '@nestjs/common';

export const FEATURE_METADATA_KEY = 'requiredFeature';

/** Marks a route/controller as belonging to an optional, plan-gated
 * module (see ../plans/feature-catalog.ts for the key catalog) — read by
 * PlanFeatureGuard. Exactly one key per controller/route: a whole
 * optional module today (e.g. 'accounting'), not a combination. */
export const RequireFeature = (feature: string): MethodDecorator & ClassDecorator =>
  SetMetadata(FEATURE_METADATA_KEY, feature);
