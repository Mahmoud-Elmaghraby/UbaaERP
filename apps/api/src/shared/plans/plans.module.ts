import { Global, Module } from '@nestjs/common';
import { PlanResolverService } from './plan-resolver.service';
import { TenantFeatureTogglesRepository } from './tenant-feature-toggles.repository';

/**
 * Global (same pattern as PrismaModule/TenancyModule) so any module that
 * needs to resolve a tenant's granted feature keys (Layer 1 —
 * PlanResolverService) or its self-service toggles (Layer 2 —
 * TenantFeatureTogglesRepository, claude/platform-flexibility-
 * strategy.md) can inject either directly. Consumers today:
 * AuthService (both, at token-issue time) and
 * FeatureTogglesController/FeatureTogglesService (settings module, the
 * "Modules" tab that manages Layer 2) — none of them need to re-declare
 * this wiring.
 */
@Global()
@Module({
  providers: [PlanResolverService, TenantFeatureTogglesRepository],
  exports: [PlanResolverService, TenantFeatureTogglesRepository],
})
export class PlansModule {}
