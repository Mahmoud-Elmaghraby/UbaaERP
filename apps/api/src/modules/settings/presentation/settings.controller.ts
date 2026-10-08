import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  tenantSettingsSchema,
  updateTenantSettingsSchema,
  type TenantSettingsDto,
  type UpdateTenantSettingsDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { TenantSettingsService } from '../application/services/tenant-settings.service';
import { COMPANY_LOGO_MAX_BYTES, CompanyProfileService } from '../application/services/company-profile.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('settings.manage')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly service: TenantSettingsService,
    private readonly connections: TenantConnectionManager,
    private readonly companyProfile: CompanyProfileService,
  ) {}

  /**
   * Readable by every signed-in user: the company name, address, tax number and
   * currency are printed on every document anyway, and every screen that shows
   * money needs the currency (a store keeper got 403s on stock pages).
   */
  @Get()
  @RequirePermissions()
  async get(@CurrentTenantSchema() schema: string): Promise<TenantSettingsDto> {
    const db = this.connections.getClient(schema);
    return tenantSettingsSchema.parse(await this.companyProfile.get(db));
  }

  @Patch()
  async update(
    @CurrentTenantSchema() schema: string,
    // The Zod pipe is bound directly to @Body(), not via a method-level
    // @UsePipes() — a method-level pipe applies to EVERY parameter of the
    // handler, including @CurrentTenantSchema()'s plain string, which then fails
    // validation against an object schema before the real body is even
    // looked at. (Same fix applied uniformly across every controller with
    // this pattern — see branches.controller.ts's create() for the fuller
    // note.)
    @Body(new ZodValidationPipe(updateTenantSettingsSchema)) body: UpdateTenantSettingsDto,
  ): Promise<TenantSettingsDto> {
    const db = this.connections.getClient(schema);
    const updated = await this.service.update(db, body);
    return tenantSettingsSchema.parse(await this.companyProfile.withLogoUrl(updated));
  }

  /** Company logo (PNG / JPEG / WebP, ≤ 1 MB) — printed on every document header. */
  @Post('logo')
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: COMPANY_LOGO_MAX_BYTES } }))
  async uploadLogo(
    @CurrentTenantSchema() schema: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined,
  ): Promise<TenantSettingsDto> {
    if (!file) throw new BadRequestException('A "logo" file is required.');
    const db = this.connections.getClient(schema);
    return tenantSettingsSchema.parse(await this.companyProfile.setLogo(db, schema, file));
  }

  @Delete('logo')
  async removeLogo(@CurrentTenantSchema() schema: string): Promise<TenantSettingsDto> {
    const db = this.connections.getClient(schema);
    return tenantSettingsSchema.parse(await this.companyProfile.removeLogo(db));
  }
}
