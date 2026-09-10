import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import { PlanResolverService } from './plan-resolver.service';
import { TenantFeatureTogglesRepository } from './tenant-feature-toggles.repository';
import type { FeatureKey } from './feature-catalog';

/**
 * Combines Layer 1 (Plan ceiling) + Layer 2 (tenant self-service toggle)
 * into one "is this feature actually usable right now" boolean — the
 * same combining logic FeatureTogglesService.list() already applies per
 * row for the Settings "Modules" tab (grantedByPlan && enabled), exposed
 * here for application code that needs to branch on it directly rather
 * than gate an HTTP request from a JWT (PlanFeatureGuard's job).
 *
 * The one consumer today: the invoice-takeover orchestrator
 * (claude/platform-flexibility-strategy.md — "قاعدة مين هيقوم بالدور").
 * When a document type in the Sales/Purchases chain is not effectively
 * enabled for a tenant, the next document toward the mandatory Invoice
 * absorbs its role automatically, inside the same transaction as the
 * invoice itself — see SalesInvoicesService.create()'s own comment.
 *
 * No port/DI-token pair of its own, same treatment PlanResolverService
 * and TenantFeatureTogglesRepository already get: registered once in
 * the @Global() PlansModule, injected directly wherever needed.
 */
@Injectable()
export class FeatureAvailabilityService {
  constructor(
    private readonly plans: PlanResolverService,
    private readonly toggles: TenantFeatureTogglesRepository,
  ) {}

  async isEnabled(db: Kysely<TenantDatabase>, schema: string, featureKey: FeatureKey): Promise<boolean> {
    const [grantedKeys, disabledKeys] = await Promise.all([
      this.plans.resolveFeatureKeysForSchema(schema),
      this.toggles.listDisabledFeatureKeys(db),
    ]);
    return grantedKeys.includes(featureKey) && !disabledKeys.includes(featureKey);
  }
}
