import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  tenantSettingsSchema,
  updateTenantSettingsSchema,
  type TenantSettingsDto,
  type UpdateTenantSettingsDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { TenantSchema } from '../../../shared/tenancy/tenant-schema.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { TenantSettingsService } from '../application/services/tenant-settings.service';

// NOTE (flagged, not decided here): master doc §9.2 restricts the Settings
// screen to Owner/Admin. That requires the Users & Permissions module's
// RBAC + <Can> (CLAUDE.md §9.1), which doesn't exist yet — it is built
// alongside Settings per the module order (§10), not before it. Every
// route below is reachable by anyone who can resolve a tenant schema
// (see TenantSchema decorator) until a real permission guard is added
// here. This is a known, explicit gap — not silently glossed over.
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly service: TenantSettingsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async get(@TenantSchema() schema: string): Promise<TenantSettingsDto> {
    const db = this.connections.getClient(schema);
    const settings = await this.service.get(db);
    return tenantSettingsSchema.parse(settings);
  }

  @Patch()
  async update(
    @TenantSchema() schema: string,
    // The Zod pipe is bound directly to @Body(), not via a method-level
    // @UsePipes() — a method-level pipe applies to EVERY parameter of the
    // handler, including @TenantSchema()'s plain string, which then fails
    // validation against an object schema before the real body is even
    // looked at. (Same fix applied uniformly across every controller with
    // this pattern — see branches.controller.ts's create() for the fuller
    // note.)
    @Body(new ZodValidationPipe(updateTenantSettingsSchema)) body: UpdateTenantSettingsDto,
  ): Promise<TenantSettingsDto> {
    const db = this.connections.getClient(schema);
    const updated = await this.service.update(db, body);
    return tenantSettingsSchema.parse(updated);
  }
}
