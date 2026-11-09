import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { updateAppSettingsSchema, type AppSettingEntryDto, type UpdateAppSettingsDto } from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { AppSettingsService } from '../application/services/app-settings.service';

/** The settings hub's options (APP_SETTINGS). Audited per key by the service itself. */
@Controller('app-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('settings.manage')
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
  update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(updateAppSettingsSchema)) body: UpdateAppSettingsDto,
  ): Promise<AppSettingEntryDto[]> {
    return this.service.update(this.connections.getClient(schema), schema, body, user.sub);
  }
}
