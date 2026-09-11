import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { TenantFeatureTogglesRepository } from '../../../../shared/plans/tenant-feature-toggles.repository';
import { PlanResolverService } from '../../../../shared/plans/plan-resolver.service';
import { ALL_FEATURE_KEYS, type FeatureKey } from '../../../../shared/plans/feature-catalog';
import { BusinessRuleError } from '../../../../shared/errors/domain-errors';

export interface FeatureToggleView {
  featureKey: FeatureKey;
  grantedByPlan: boolean;
  enabled: boolean;
  updatedAt: Date | null;
}

/**
 * Backs the Settings "Modules" tab — Layer 2 of the platform-
 * flexibility design (claude/platform-flexibility-strategy.md). Plain
 * application service, no port/DI-token pair of its own: both
 * dependencies below are already globally provided (PlansModule), same
 * treatment TenantFeatureTogglesRepository's own comment explains.
 */
@Injectable()
export class FeatureTogglesService {
  constructor(
    private readonly toggles: TenantFeatureTogglesRepository,
    private readonly plans: PlanResolverService,
  ) {}

  async list(db: Kysely<TenantDatabase>, schema: string): Promise<FeatureToggleView[]> {
    const [grantedKeys, rows] = await Promise.all([
      this.plans.resolveFeatureKeysForSchema(schema),
      this.toggles.list(db),
    ]);
    const rowByKey = new Map(rows.map((row) => [row.featureKey, row]));

    return ALL_FEATURE_KEYS.map((featureKey) => {
      const row = rowByKey.get(featureKey);
      return {
        featureKey,
        grantedByPlan: grantedKeys.includes(featureKey),
        // Fail-open default (migration 0069's own comment): no row yet
        // means the tenant has never turned this module off.
        enabled: row?.enabled ?? true,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  async setEnabled(
    db: Kysely<TenantDatabase>,
    schema: string,
    featureKey: string,
    enabled: boolean,
  ): Promise<FeatureToggleView> {
    if (!ALL_FEATURE_KEYS.includes(featureKey as FeatureKey)) {
      throw new BusinessRuleError(`Unknown feature key "${featureKey}".`, {
        code: 'FEATURE_TOGGLES.UNKNOWN_FEATURE_KEY',
        params: { featureKey },
      });
    }

    const grantedKeys = await this.plans.resolveFeatureKeysForSchema(schema);
    // Layer 1 is the ceiling: a tenant can turn OFF anything (even
    // something their plan no longer grants, harmlessly — PlanFeatureGuard
    // already blocks it either way), but can only turn something ON if
    // their plan actually includes it. Rejecting this clearly here beats
    // silently accepting a toggle that would never take effect.
    if (enabled && !grantedKeys.includes(featureKey as FeatureKey)) {
      throw new BusinessRuleError(`Cannot enable "${featureKey}" — this tenant's plan does not include it.`, {
        code: 'FEATURE_TOGGLES.NOT_GRANTED_BY_PLAN',
        params: { featureKey },
      });
    }

    const row = await this.toggles.setEnabled(db, featureKey, enabled);
    return {
      featureKey: featureKey as FeatureKey,
      grantedByPlan: grantedKeys.includes(featureKey as FeatureKey),
      enabled: row.enabled,
      updatedAt: row.updatedAt,
    };
  }
}
