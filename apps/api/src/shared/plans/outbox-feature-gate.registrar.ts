import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { TenantConnectionManager } from '../tenancy/tenant-connection-manager';
import { registerOutboxFeatureChecker } from '../events/outbox-feature-gate';
import { FeatureAvailabilityService } from './feature-availability.service';

/** Wires @OnOutboxEvent({ requiresFeature }) to the real Plan + Settings › Modules answer. */
@Injectable()
export class OutboxFeatureGateRegistrar implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly features: FeatureAvailabilityService,
    private readonly connections: TenantConnectionManager,
  ) {}

  onModuleInit(): void {
    registerOutboxFeatureChecker({
      isEnabledForSchema: (schema, featureKey) =>
        this.features.isEnabled(this.connections.getClient(schema), schema, featureKey),
    });
  }

  onModuleDestroy(): void {
    registerOutboxFeatureChecker(null);
  }
}
