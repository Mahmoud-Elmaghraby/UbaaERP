import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  landedCostSchema,
  applyLandedCostSchema,
  type LandedCostDto,
  type ApplyLandedCostDto,
} from '@erp-platform/contracts';
import type { LandedCost } from '../domain/landed-cost.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { INVENTORY_PERMISSIONS as P } from '../../../shared/auth/inventory-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { LandedCostsService } from '../application/services/landed-costs.service';
import { InventoryEventPublisher } from '../infrastructure/events/inventory-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';

function landedCostToDto(landedCost: LandedCost): LandedCostDto {
  return landedCostSchema.parse({
    id: landedCost.id,
    totalCost: moneyToDto(landedCost.totalCost),
    allocationMethod: landedCost.allocationMethod,
    referenceType: landedCost.referenceType,
    referenceId: landedCost.referenceId,
    notes: landedCost.notes,
    createdBy: landedCost.createdBy,
    createdAt: landedCost.createdAt,
    allocations: landedCost.allocations.map((allocation) => ({
      id: allocation.id,
      landedCostId: allocation.landedCostId,
      stockMovementId: allocation.stockMovementId,
      productVariantId: allocation.productVariantId,
      locationId: allocation.locationId,
      warehouseId: allocation.warehouseId,
      allocatedAmount: moneyToDto(allocation.allocatedAmount),
      expensedAmount: moneyToDto(allocation.expensedAmount),
      resultingAverageCost: moneyToDto(allocation.resultingAverageCost),
      createdAt: allocation.createdAt,
    })),
  });
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(P.landedCostsManage, P.costsView)
@Controller('landed-costs')
export class LandedCostsController {
  constructor(
    private readonly service: LandedCostsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: InventoryEventPublisher,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<LandedCostDto[]> {
    const db = this.connections.getClient(schema);
    const landedCosts = await this.service.list(db);
    return landedCosts.map(landedCostToDto);
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<LandedCostDto> {
    const db = this.connections.getClient(schema);
    const landedCost = await this.service.getById(db, id);
    return landedCostToDto(landedCost);
  }

  @Post()
  async apply(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(applyLandedCostSchema)) body: ApplyLandedCostDto,
  ): Promise<LandedCostDto> {
    const db = this.connections.getClient(schema);
    const landedCost = await this.service.apply(
      db,
      {
        ...body,
        totalCost: moneyFromDto(body.totalCost),
        createdBy: user.sub,
      },
      { schema, actorUserId: user.sub },
    );
    this.events.publish('landed_cost', 'applied', {
      schema,
      entityId: landedCost.id,
      actorUserId: user.sub,
      metadata: { stockMovementIds: body.stockMovementIds, allocationMethod: body.allocationMethod },
    });
    return landedCostToDto(landedCost);
  }
}
