import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { TenantFeatureTogglesRepository } from '../../../../shared/plans/tenant-feature-toggles.repository';
import type { PlanResolverService } from '../../../../shared/plans/plan-resolver.service';
import { FEATURE_KEYS, ALL_FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import { BusinessRuleError } from '../../../../shared/errors/domain-errors';
import { FeatureTogglesService } from './feature-toggles.service';

const FAKE_DB = {} as Kysely<TenantDatabase>;
const SCHEMA = 'acme';

function makeMockToggles(): jest.Mocked<TenantFeatureTogglesRepository> {
  return {
    list: jest.fn(),
    listDisabledFeatureKeys: jest.fn(),
    setEnabled: jest.fn(),
  } as unknown as jest.Mocked<TenantFeatureTogglesRepository>;
}

function makeMockPlans(): jest.Mocked<PlanResolverService> {
  return {
    resolveFeatureKeysForSchema: jest.fn(),
  } as unknown as jest.Mocked<PlanResolverService>;
}

describe('FeatureTogglesService', () => {
  let toggles: jest.Mocked<TenantFeatureTogglesRepository>;
  let plans: jest.Mocked<PlanResolverService>;
  let service: FeatureTogglesService;

  beforeEach(() => {
    toggles = makeMockToggles();
    plans = makeMockPlans();
    service = new FeatureTogglesService(toggles, plans);
  });

  describe('list()', () => {
    it('defaults every catalog key with no stored row to enabled=true (fail-open)', async () => {
      plans.resolveFeatureKeysForSchema.mockResolvedValue(ALL_FEATURE_KEYS);
      toggles.list.mockResolvedValue([]);

      const result = await service.list(FAKE_DB, SCHEMA);

      expect(result).toHaveLength(ALL_FEATURE_KEYS.length);
      expect(result.every((r) => r.enabled === true)).toBe(true);
      expect(result.every((r) => r.grantedByPlan === true)).toBe(true);
    });

    it('reflects an explicit disabled row, and marks keys the plan does not grant', async () => {
      plans.resolveFeatureKeysForSchema.mockResolvedValue([FEATURE_KEYS.ACCOUNTING]);
      toggles.list.mockResolvedValue([
        { featureKey: FEATURE_KEYS.SALES_QUOTATIONS, enabled: false, updatedAt: new Date('2026-01-01') },
      ]);

      const result = await service.list(FAKE_DB, SCHEMA);

      const quotations = result.find((r) => r.featureKey === FEATURE_KEYS.SALES_QUOTATIONS);
      expect(quotations).toMatchObject({ enabled: false, grantedByPlan: false });

      const accounting = result.find((r) => r.featureKey === FEATURE_KEYS.ACCOUNTING);
      expect(accounting).toMatchObject({ enabled: true, grantedByPlan: true });
    });
  });

  describe('setEnabled()', () => {
    it('rejects an unknown feature key without touching the repository', async () => {
      await expect(service.setEnabled(FAKE_DB, SCHEMA, 'not-a-real-key', true)).rejects.toThrow(BusinessRuleError);
      expect(toggles.setEnabled).not.toHaveBeenCalled();
    });

    it('rejects enabling a feature the tenant\'s plan does not grant', async () => {
      plans.resolveFeatureKeysForSchema.mockResolvedValue([FEATURE_KEYS.ACCOUNTING]);

      await expect(
        service.setEnabled(FAKE_DB, SCHEMA, FEATURE_KEYS.SALES_QUOTATIONS, true),
      ).rejects.toThrow(BusinessRuleError);
      expect(toggles.setEnabled).not.toHaveBeenCalled();
    });

    it('allows disabling a feature even if the plan no longer grants it (harmless, already blocked elsewhere)', async () => {
      plans.resolveFeatureKeysForSchema.mockResolvedValue([FEATURE_KEYS.ACCOUNTING]);
      toggles.setEnabled.mockResolvedValue({
        featureKey: FEATURE_KEYS.SALES_QUOTATIONS,
        enabled: false,
        updatedAt: new Date('2026-01-01'),
      });

      const result = await service.setEnabled(FAKE_DB, SCHEMA, FEATURE_KEYS.SALES_QUOTATIONS, false);

      expect(result).toMatchObject({ enabled: false, grantedByPlan: false });
      expect(toggles.setEnabled).toHaveBeenCalledWith(FAKE_DB, FEATURE_KEYS.SALES_QUOTATIONS, false);
    });

    it('enables a feature the plan grants and returns the updated view', async () => {
      plans.resolveFeatureKeysForSchema.mockResolvedValue(ALL_FEATURE_KEYS);
      toggles.setEnabled.mockResolvedValue({
        featureKey: FEATURE_KEYS.SALES_QUOTATIONS,
        enabled: true,
        updatedAt: new Date('2026-01-01'),
      });

      const result = await service.setEnabled(FAKE_DB, SCHEMA, FEATURE_KEYS.SALES_QUOTATIONS, true);

      expect(result).toMatchObject({ enabled: true, grantedByPlan: true });
    });
  });
});
