import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  productUnitSchema,
  replaceProductUnitsSchema,
  type ProductUnitDto,
  type ReplaceProductUnitsDto,
} from '@erp-platform/contracts';
import type { ProductUnit } from '../domain/product-unit.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { CATALOG_READ_PERMISSIONS, INVENTORY_PERMISSIONS as P, canViewPurchasePrices, withoutPurchasePrices } from '../../../shared/auth/inventory-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { ProductUnitsService } from '../application/services/product-units.service';
import { InventoryEventPublisher } from '../infrastructure/events/inventory-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';

function unitToDto(unit: ProductUnit): ProductUnitDto {
  return productUnitSchema.parse({
    ...unit,
    salePrice: unit.salePrice ? moneyToDto(unit.salePrice) : null,
    purchasePrice: unit.purchasePrice ? moneyToDto(unit.purchasePrice) : null,
  });
}

/** A product's extra trading units (carton, sack, box…). */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(P.productsManage)
@Controller('products/:id/units')
export class ProductUnitsController {
  constructor(
    private readonly service: ProductUnitsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: InventoryEventPublisher,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(...CATALOG_READ_PERMISSIONS)
  async list(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<ProductUnitDto[]> {
    const units = (await this.service.list(this.connections.getClient(schema), id)).map(unitToDto);
    return canViewPurchasePrices(user.permissions) ? units : withoutPurchasePrices(units);
  }

  /** Replaces the whole list. */
  @Put()
  async replace(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replaceProductUnitsSchema)) body: ReplaceProductUnitsDto,
  ): Promise<ProductUnitDto[]> {
    const db = this.connections.getClient(schema);
    // Users who can't see purchase prices keep whatever was stored for a unit.
    const keptPurchasePrices = canViewPurchasePrices(user.permissions)
      ? null
      : new Map((await this.service.list(db, id)).map((unit) => [unit.unitOfMeasureId, unit.purchasePrice]));
    const units = await this.service.replace(
      db,
      id,
      body.units.map((unit) => ({
        ...unit,
        salePrice: unit.salePrice ? moneyFromDto(unit.salePrice) : null,
        purchasePrice: keptPurchasePrices
          ? (keptPurchasePrices.get(unit.unitOfMeasureId) ?? null)
          : unit.purchasePrice
            ? moneyFromDto(unit.purchasePrice)
            : null,
      })),
    );
    this.events.publish('product', 'units_updated', { schema, entityId: id, actorUserId: user.sub });
    return units.map(unitToDto);
  }
}
