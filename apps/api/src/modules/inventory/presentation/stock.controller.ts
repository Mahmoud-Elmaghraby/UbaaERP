import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  stockLevelSchema,
  setReorderPointSchema,
  stockMovementSchema,
  recordStockMovementSchema,
  transferStockSchema,
  stockLotSchema,
  expiringLotSchema,
  type ExpiringLotDto,
  type StockLevelDto,
  type SetReorderPointDto,
  type StockMovementDto,
  type RecordStockMovementDto,
  type TransferStockDto,
  type StockLotDto,
} from '@erp-platform/contracts';
import type { StockLevel } from '../domain/stock-level.entity';
import type { StockMovement } from '../domain/stock-movement.entity';
import type { StockLotWithLevels } from '../domain/stock-lot.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { StockMovementsService } from '../application/services/stock-movements.service';
import { InventoryEventPublisher } from '../infrastructure/events/inventory-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';

function stockLevelToDto(level: StockLevel): StockLevelDto {
  return stockLevelSchema.parse({
    id: level.id,
    productVariantId: level.productVariantId,
    locationId: level.locationId,
    warehouseId: level.warehouseId,
    quantityOnHand: level.quantityOnHand,
    reorderPoint: level.reorderPoint,
    averageCost: moneyToDto(level.averageCost),
    createdAt: level.createdAt,
    updatedAt: level.updatedAt,
  });
}

function stockLotToDto(lot: StockLotWithLevels): StockLotDto {
  return stockLotSchema.parse({
    id: lot.id,
    productVariantId: lot.productVariantId,
    lotNumber: lot.lotNumber,
    expiryDate: lot.expiryDate,
    unitCost: moneyToDto(lot.unitCost),
    createdAt: lot.createdAt,
    updatedAt: lot.updatedAt,
    levels: lot.levels.map((level) => ({
      id: level.id,
      stockLotId: level.stockLotId,
      locationId: level.locationId,
      warehouseId: level.warehouseId,
      quantityOnHand: level.quantityOnHand,
      createdAt: level.createdAt,
      updatedAt: level.updatedAt,
    })),
  });
}

function stockMovementToDto(movement: StockMovement): StockMovementDto {
  return stockMovementSchema.parse({
    id: movement.id,
    productVariantId: movement.productVariantId,
    locationId: movement.locationId,
    warehouseId: movement.warehouseId,
    movementType: movement.movementType,
    quantity: movement.quantity,
    unitCost: movement.unitCost ? moneyToDto(movement.unitCost) : null,
    resultingAverageCost: moneyToDto(movement.resultingAverageCost),
    referenceType: movement.referenceType,
    referenceId: movement.referenceId,
    relatedMovementId: movement.relatedMovementId,
    stockLotId: movement.stockLotId,
    notes: movement.notes,
    createdBy: movement.createdBy,
    createdAt: movement.createdAt,
  });
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('inventory.manage')
@Controller('stock')
export class StockController {
  constructor(
    private readonly service: StockMovementsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: InventoryEventPublisher,
  ) {}

  @Get('levels')
  async listStockLevels(
    @CurrentTenantSchema() schema: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('locationId') locationId?: string,
    @Query('productVariantId') productVariantId?: string,
  ): Promise<StockLevelDto[]> {
    const db = this.connections.getClient(schema);
    const levels = await this.service.listStockLevels(db, { warehouseId, locationId, productVariantId });
    return levels.map(stockLevelToDto);
  }

  /** Read by sales/purchase users too — the delivery form lets them pick a lot. */
  @Get('lots')
  @RequirePermissions()
  @RequireAnyPermission('inventory.manage', 'sales.manage', 'purchases.manage')
  async listLots(
    @CurrentTenantSchema() schema: string,
    @Query('productVariantId') productVariantId: string,
  ): Promise<StockLotDto[]> {
    const db = this.connections.getClient(schema);
    const lots = await this.service.listLots(db, productVariantId);
    return lots.map(stockLotToDto);
  }

  /** Near-expiry report: lots on hand expiring within `withinDays` (default 90, max 3650), expired ones included. */
  @Get('expiring-lots')
  async listExpiringLots(
    @CurrentTenantSchema() schema: string,
    @Query('withinDays') withinDays?: string,
  ): Promise<ExpiringLotDto[]> {
    const parsed = Number.parseInt(withinDays ?? '', 10);
    const days = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 3650) : 90;
    const db = this.connections.getClient(schema);
    const rows = await this.service.listExpiringLots(db, days);
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return rows.map((row) =>
      expiringLotSchema.parse({
        ...row,
        daysToExpiry: Math.round(
          (Date.UTC(row.expiryDate.getFullYear(), row.expiryDate.getMonth(), row.expiryDate.getDate()) - todayUtc) /
            86_400_000,
        ),
      }),
    );
  }

  @Patch('levels/:id/reorder-point')
  async setReorderPoint(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setReorderPointSchema)) body: SetReorderPointDto,
  ): Promise<StockLevelDto> {
    const db = this.connections.getClient(schema);
    const level = await this.service.setReorderPoint(db, id, body.reorderPoint);
    this.events.publish('stock_level', 'reorder_point_updated', {
      schema,
      entityId: level.id,
      actorUserId: user.sub,
      metadata: { reorderPoint: body.reorderPoint },
    });
    return stockLevelToDto(level);
  }

  @Get('movements')
  async listMovements(
    @CurrentTenantSchema() schema: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('locationId') locationId?: string,
    @Query('productVariantId') productVariantId?: string,
    @Query('limit') limit?: string,
  ): Promise<StockMovementDto[]> {
    const db = this.connections.getClient(schema);
    const movements = await this.service.list(db, {
      warehouseId,
      locationId,
      productVariantId,
      limit: limit ? Number(limit) : undefined,
    });
    return movements.map(stockMovementToDto);
  }

  @Post('movements')
  async recordMovement(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(recordStockMovementSchema)) body: RecordStockMovementDto,
  ): Promise<StockMovementDto> {
    const db = this.connections.getClient(schema);
    const movement = await this.service.recordMovement(db, {
      ...body,
      unitCost: body.unitCost ? moneyFromDto(body.unitCost) : undefined,
      createdBy: user.sub,
    });
    this.events.publish('stock_movement', 'recorded', {
      schema,
      entityId: movement.id,
      actorUserId: user.sub,
      metadata: { movementType: movement.movementType, quantity: movement.quantity },
    });
    return stockMovementToDto(movement);
  }

  @Post('transfers')
  async transferStock(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(transferStockSchema)) body: TransferStockDto,
  ): Promise<{ transferOut: StockMovementDto; transferIn: StockMovementDto }> {
    const db = this.connections.getClient(schema);
    const result = await this.service.transferStock(db, { ...body, createdBy: user.sub });
    this.events.publish('stock_transfer', 'recorded', {
      schema,
      entityId: result.transferOut.id,
      actorUserId: user.sub,
      metadata: { relatedMovementId: result.transferIn.id, quantity: body.quantity },
    });
    return {
      transferOut: stockMovementToDto(result.transferOut),
      transferIn: stockMovementToDto(result.transferIn),
    };
  }
}
