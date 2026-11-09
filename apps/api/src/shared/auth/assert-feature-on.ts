import { ForbiddenException } from '@nestjs/common';
import type { JwtAccessPayload } from './jwt-payload.type';

/**
 * For a feature that is a CHOICE inside an otherwise always-on document (a cheque as the payment
 * method of a receipt) — PlanFeatureGuard covers whole controllers; this covers the one option.
 * Same rule: refused when the plan lacks it or the tenant switched it off.
 */
export function assertFeatureOn(user: JwtAccessPayload, featureKey: string): void {
  if (!(user.features ?? []).includes(featureKey) || (user.disabledFeatures ?? []).includes(featureKey)) {
    throw new ForbiddenException(`The "${featureKey}" module has been turned off in this tenant's settings.`);
  }
}
