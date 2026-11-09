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
 * Two layers now, per claude/platform-flexibility-strategy.md's "Layer
 * 2" (tenant self-service, on top of Layer 1's commercial ceiling):
 *
 *  1. Plan (`features[]`) — enforced on EVERY HTTP method, GET
 *     included. A tenant whose plan doesn't include this module gets
 *     nothing at all, not even a read. This is the hard ceiling; it
 *     doesn't change based on the request method.
 *  2. Tenant self-service toggle (`disabledFeatures[]`, see
 *     FeatureTogglesController — the "Modules" tab in Settings) —
 *     checked only for non-GET requests. A tenant that has turned this
 *     module off for themselves can still read whatever they already
 *     created with it (an explicit product decision — old Sales
 *     Orders, RFQs, etc. stay visible), but cannot create/update/delete
 *     through it anymore. This mirrors SAP B1/ERPNext's own behavior
 *     when an optional document type is disabled.
 *
 * Structurally still the same reflector-metadata pattern as
 * PermissionsGuard — same "no metadata = allow" default (a route with
 * no @RequireFeature() isn't part of any optional module).
 */
@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Class AND method keys all apply: e.g. Fixed Assets needs 'accounting' (class) and
    // 'fixed_assets' (its own switch) — an override would silently drop the class key.
    const required = [
      this.reflector.get<string | undefined>(FEATURE_METADATA_KEY, context.getClass()),
      this.reflector.get<string | undefined>(FEATURE_METADATA_KEY, context.getHandler()),
    ].filter((key): key is string => Boolean(key));
    if (required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtAccessPayload; method?: string }>();
    const grantedFeatures = request.user?.features ?? [];
    const notGranted = required.find((key) => !grantedFeatures.includes(key));
    if (notGranted) {
      throw new ForbiddenException(`This tenant's plan does not include the "${notGranted}" module.`);
    }

    // Layer 1 passed. GET requests stop here — reading data through an
    // optional module the tenant has turned off for themselves is still
    // allowed (see class comment above).
    if (request.method === 'GET') return true;

    const disabledFeatures = request.user?.disabledFeatures ?? [];
    const disabled = required.find((key) => disabledFeatures.includes(key));
    if (disabled) {
      throw new ForbiddenException(`The "${disabled}" module has been turned off in this tenant's settings.`);
    }
    return true;
  }
}
