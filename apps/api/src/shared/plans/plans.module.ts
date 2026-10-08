import { Global, Module } from '@nestjs/common';
import { PlanResolverService } from './plan-resolver.service';
import { TenantFeatureTogglesRepository } from './tenant-feature-toggles.repository';
import { FeatureAvailabilityService } from './feature-availability.service';
import { OutboxFeatureGateRegistrar } from './outbox-feature-gate.registrar';

/**
 * Global (same pattern as PrismaModule/TenancyModule) so any module that
 * needs to resolve a tenant's granted feature keys (Layer 1 —
 * PlanResolverService), its self-service toggles (Layer 2 —
 * TenantFeatureTogglesRepository), or the two combined into one
 * "effectively enabled" boolean (FeatureAvailabilityService) —
 * claude/platform-flexibility-strategy.md — can inject any of them
 * directly. Consumers today: AuthService (Layer 1 + Layer 2, at
 * token-issue time), FeatureTogglesController/FeatureTogglesService
 * (settings module, the "Modules" tab that manages Layer 2), and
 * SalesInvoicesService (the invoice-takeover orchestrator) — none of
 * them need to re-declare this wiring.
 */
@Global()
@Module({
  providers: [PlanResolverService, TenantFeatureTogglesRepository, FeatureAvailabilityService, OutboxFeatureGateRegistrar],
  exports: [PlanResolverService, TenantFeatureTogglesRepository, FeatureAvailabilityService],
})
export class PlansModule {}
