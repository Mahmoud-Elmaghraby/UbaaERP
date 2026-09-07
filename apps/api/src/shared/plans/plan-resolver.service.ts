import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ALL_FEATURE_KEYS, type FeatureKey } from './feature-catalog';

/**
 * Resolves which feature keys a tenant's plan grants — the one place
 * PlanFeatureGuard-gated code (currently: AuthService, at token-issue
 * time — see its own comment on why this is baked into the JWT rather
 * than looked up per-request) asks "what can this tenant use?".
 *
 * Fail-open on a tenant with no plan assigned (Tenant.planId is null):
 * returns every known feature key rather than none. This is deliberate,
 * not an oversight — every tenant provisioned before this pass (and any
 * tenant an admin hasn't gotten around to assigning a plan to yet) has
 * planId = null, and PlanFeatureGuard is a new gate being added on top
 * of code that already worked unconditionally. Failing closed here would
 * silently lock existing tenants out of Accounting the moment this
 * shipped — the opposite of what CLAUDE.md §2.8 (add gating "from day
 * one" for something GENUINELY new) is asking for. New tenants get a
 * real plan from provisionTenant() onward; this fallback is a safety net
 * for the transition, not the intended steady state.
 */
@Injectable()
export class PlanResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveFeatureKeysForSchema(schemaName: string): Promise<FeatureKey[]> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { schemaName },
      select: { planId: true },
    });

    if (!tenant?.planId) {
      return ALL_FEATURE_KEYS;
    }

    const grants = await this.prisma.planFeature.findMany({
      where: { planId: tenant.planId },
      select: { featureKey: true },
    });
    return grants.map((g) => g.featureKey as FeatureKey);
  }
}
