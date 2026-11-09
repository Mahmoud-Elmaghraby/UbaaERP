import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  etaCredentialsSchema,
  updateEtaCredentialsSchema,
  type EtaCredentialsDto,
  type UpdateEtaCredentialsDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { SALES_PERMISSIONS as S } from '../../../shared/auth/trade-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { EtaCredentialsService } from '../application/services/eta-credentials.service';
import { SalesEventPublisher } from '../infrastructure/events/sales-event-publisher';

/**
 * Settings-shaped singleton, same as TenantSettingsController (GET +
 * PATCH only — no POST/DELETE, see migration 0040's comment). Gated by
 * 'sales.settings.manage' (migration 0117), reading included — it holds credentials.
 *
 * No PlanFeatureGuard: intentionally excluded — this is an integration
 * credentials record, not one of the optional document-chain steps
 * PlanFeatureGuard gates (see feature-catalog.ts).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('eta-credentials')
export class EtaCredentialsController {
  constructor(
    private readonly service: EtaCredentialsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: SalesEventPublisher,
  ) {}

  @Get()
  @RequirePermissions(S.settingsManage)
  async get(@CurrentTenantSchema() schema: string): Promise<EtaCredentialsDto> {
    const db = this.connections.getClient(schema);
    const credentials = await this.service.get(db);
    return etaCredentialsSchema.parse(credentials);
  }

  @Patch()
  @RequirePermissions(S.settingsManage)
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(updateEtaCredentialsSchema)) body: UpdateEtaCredentialsDto,
  ): Promise<EtaCredentialsDto> {
    const db = this.connections.getClient(schema);
    const credentials = await this.service.update(db, body);
    this.events.publish('eta_credentials', 'updated', { schema, entityId: credentials.id, actorUserId: user.sub });
    return etaCredentialsSchema.parse(credentials);
  }
}
