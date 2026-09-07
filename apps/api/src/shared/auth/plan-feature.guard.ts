import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtAccessPayload } from './jwt-payload.type';
import { FEATURE_METADATA_KEY } from './require-feature.decorator';

/**
 * The real fix for the نبغة lesson CLAUDE.md §2.8/§13 flags: a
 * tenant's plan is enforced HERE, at the API layer, not just hidden in
 * the frontend nav. Checks the JWT payload's baked-in `features` array
 * (computed by AuthService.issueTokens() from PlanResolverService, same
 * staleness trade-off already accepted for `permissions` — see
 * PermissionsGuard's class comment) against @RequireFeature(...) on the
 * route. Must run after JwtAuthGuard (needs request.user populated).
 *
 * Structurally identical to PermissionsGuard on purpose — same
 * reflector-metadata pattern, same "no metadata = allow" default (a
 * route with no @RequireFeature() isn't part of any optional module) —
 * so anyone who already understands one guard understands both.
 */
@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(FEATURE_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtAccessPayload }>();
    const grantedFeatures = request.user?.features ?? [];
    if (!grantedFeatures.includes(required)) {
      throw new ForbiddenException(
        `This tenant's plan does not include the "${required}" module.`,
      );
    }
    return true;
  }
}
