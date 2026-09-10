import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  featureToggleSchema,
  updateFeatureToggleSchema,
  type FeatureToggleDto,
  type UpdateFeatureToggleDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { FeatureTogglesService } from '../application/services/feature-toggles.service';

/**
 * Layer 2 of the platform-flexibility design
 * (claude/platform-flexibility-strategy.md): the "Modules" tab lets any
 * user with settings.manage turn an optional module on/off for this
 * tenant, WITHIN whatever their Plan (Layer 1) already grants — see
 * FeatureTogglesService's own comment for the enable-time plan check.
 *
 * No PlanFeatureGuard here on purpose — this controller IS the screen
 * that manages the tenant side of that gate, not a gated module itself.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('settings.manage')
@Controller('feature-toggles')
export class FeatureTogglesController {
  constructor(
    private readonly service: FeatureTogglesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<FeatureToggleDto[]> {
    const db = this.connections.getClient(schema);
    const rows = await this.service.list(db, schema);
    return rows.map((row) => featureToggleSchema.parse(row));
  }

  @Patch(':featureKey')
  async setEnabled(
    @CurrentTenantSchema() schema: string,
    @Param('featureKey') featureKey: string,
    @Body(new ZodValidationPipe(updateFeatureToggleSchema)) body: UpdateFeatureToggleDto,
  ): Promise<FeatureToggleDto> {
    const db = this.connections.getClient(schema);
    const row = await this.service.setEnabled(db, schema, featureKey, body.enabled);
    return featureToggleSchema.parse(row);
  }
}
