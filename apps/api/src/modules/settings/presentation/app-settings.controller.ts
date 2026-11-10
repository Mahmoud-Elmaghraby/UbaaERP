import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { updateAppSettingsSchema, type AppSettingEntryDto, type UpdateAppSettingsDto } from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission } from '../../../shared/auth/require-permissions.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { AppSettingsService } from '../application/services/app-settings.service';

/**
 * The settings hub's options (APP_SETTINGS). Readable by every signed-in user (the POS and the
 * document editors apply them); each section says who may change it, checked per key by the
 * service, which also audits every change.
 */
@Controller('app-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AppSettingsController {
  constructor(
    private readonly service: AppSettingsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  list(@CurrentTenantSchema() schema: string): Promise<AppSettingEntryDto[]> {
    return this.service.list(this.connections.getClient(schema));
  }

  @Patch()
  @RequireAnyPermission('settings.manage', 'sales.settings.manage')
  update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(updateAppSettingsSchema)) body: UpdateAppSettingsDto,
  ): Promise<AppSettingEntryDto[]> {
    return this.service.update(this.connections.getClient(schema), schema, body, user.sub, user.permissions);
  }
}
