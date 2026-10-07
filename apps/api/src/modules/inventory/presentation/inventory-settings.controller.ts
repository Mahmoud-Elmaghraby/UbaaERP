import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  inventorySettingsSchema,
  updateInventorySettingsSchema,
  type InventorySettingsDto,
  type UpdateInventorySettingsDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission } from '../../../shared/auth/require-permissions.decorator';
import { CATALOG_READ_PERMISSIONS, INVENTORY_PERMISSIONS as P } from '../../../shared/auth/inventory-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { InventorySettingsService } from '../application/services/inventory-settings.service';

/**
 * Inventory module settings (Settings › Modules › Inventory). Read by the
 * product form (code/barcode modes) and by POS / document pickers (scale
 * barcode layout), so GET accepts any role that works with products;
 * changing them is a settings action.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory-settings')
export class InventorySettingsController {
  constructor(
    private readonly service: InventorySettingsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequireAnyPermission(...CATALOG_READ_PERMISSIONS, 'settings.manage')
  async get(@CurrentTenantSchema() schema: string): Promise<InventorySettingsDto> {
    const settings = await this.service.get(this.connections.getClient(schema));
    return inventorySettingsSchema.parse(settings);
  }

  @Patch()
  @RequireAnyPermission('settings.manage', P.settingsManage)
  async update(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(updateInventorySettingsSchema)) body: UpdateInventorySettingsDto,
  ): Promise<InventorySettingsDto> {
    const settings = await this.service.update(this.connections.getClient(schema), body);
    return inventorySettingsSchema.parse(settings);
  }
}
