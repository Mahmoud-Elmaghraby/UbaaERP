import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createStockTransferSchema,
  inTransitValueSchema,
  receiveStockTransferSchema,
  stockTransferSchema,
  stockTransferStatusSchema,
  stockTransferWithLinesSchema,
  updateStockTransferSchema,
  type CreateStockTransferDto,
  type InTransitValueDto,
  type ReceiveStockTransferDto,
  type StockTransferDto,
  type StockTransferWithLinesDto,
  type UpdateStockTransferDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { INVENTORY_PERMISSIONS as P, canViewCosts } from '../../../shared/auth/inventory-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { StockTransfersService } from '../application/services/stock-transfers.service';
import type { StockTransferWithLines } from '../domain/stock-transfer.entity';
import { InventoryEventPublisher } from '../infrastructure/events/inventory-event-publisher';
import { moneyToDto } from './money.mapper';

function withLinesToDto(transfer: StockTransferWithLines, showCost: boolean): StockTransferWithLinesDto {
  return stockTransferWithLinesSchema.parse({
    ...transfer,
    lines: transfer.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      productVariantId: line.productVariantId,
      quantity: line.quantity,
      unitOfMeasureId: line.unitOfMeasureId,
      unitFactor: line.unitFactor,
      lots: line.lots,
      dispatchedQuantity: line.dispatched.reduce((sum, piece) => sum + piece.quantity, 0),
      dispatchedValue: showCost && line.dispatchedValue ? moneyToDto(line.dispatchedValue) : null,
      receivedQuantity: line.receivedQuantity,
      notes: line.notes,
    })),
  });
}

const VIEW = [P.transfersManage, P.transfersApprove] as const;

/** Warehouse transfer documents (migration 0083). Drafts need transfers.manage; moving goods needs transfers.approve. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(P.transfersManage)
@Controller('stock-transfers')
export class StockTransfersController {
  constructor(
    private readonly service: StockTransfersService,
    private readonly connections: TenantConnectionManager,
    private readonly events: InventoryEventPublisher,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(...VIEW)
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
  ): Promise<StockTransferDto[]> {
    const parsedStatus = stockTransferStatusSchema.safeParse(status).data;
    const rows = await this.service.list(this.connections.getClient(schema), { status: parsedStatus, warehouseId });
    return rows.map((row) => stockTransferSchema.parse(row));
  }

  /** Goods on the road, per destination warehouse (valuation report). */
  @Get('in-transit-value')
  @RequirePermissions(P.costsView)
  async inTransitValue(@CurrentTenantSchema() schema: string): Promise<InTransitValueDto[]> {
    const rows = await this.service.inTransitValue(this.connections.getClient(schema));
    return rows.map((row) =>
      inTransitValueSchema.parse({
        toWarehouseId: row.toWarehouseId,
        transfers: row.transfers,
        value: { amountMinorUnits: row.valueMinorUnits, currency: row.currency },
      }),
    );
  }

  @Get(':id')
  @RequirePermissions()
  @RequireAnyPermission(...VIEW)
  async get(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<StockTransferWithLinesDto> {
    const transfer = await this.service.getById(this.connections.getClient(schema), id);
    return withLinesToDto(transfer, canViewCosts(user.permissions));
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createStockTransferSchema)) body: CreateStockTransferDto,
  ): Promise<StockTransferWithLinesDto> {
    const transfer = await this.service.create(this.connections.getClient(schema), body, user.sub);
    this.events.publish('stock_transfer', 'created', { schema, entityId: transfer.id, actorUserId: user.sub });
    return withLinesToDto(transfer, canViewCosts(user.permissions));
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStockTransferSchema)) body: UpdateStockTransferDto,
  ): Promise<StockTransferWithLinesDto> {
    const transfer = await this.service.update(this.connections.getClient(schema), id, body);
    return withLinesToDto(transfer, canViewCosts(user.permissions));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    await this.service.delete(this.connections.getClient(schema), id);
  }

  @Post(':id/dispatch')
  @RequirePermissions(P.transfersApprove)
  async dispatch(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<StockTransferWithLinesDto> {
    const transfer = await this.service.dispatch(this.connections.getClient(schema), id, { schema, userId: user.sub });
    this.events.publish('stock_transfer', 'dispatched', { schema, entityId: id, actorUserId: user.sub });
    return withLinesToDto(transfer, canViewCosts(user.permissions));
  }

  @Post(':id/receive')
  @RequirePermissions(P.transfersApprove)
  async receive(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(receiveStockTransferSchema)) body: ReceiveStockTransferDto,
  ): Promise<StockTransferWithLinesDto> {
    const transfer = await this.service.receive(this.connections.getClient(schema), id, body, {
      schema,
      userId: user.sub,
    });
    this.events.publish('stock_transfer', 'received', { schema, entityId: id, actorUserId: user.sub });
    return withLinesToDto(transfer, canViewCosts(user.permissions));
  }

  /** Dispatch + receive in one step. */
  @Post(':id/post')
  @RequirePermissions(P.transfersApprove)
  async post(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<StockTransferWithLinesDto> {
    const transfer = await this.service.post(this.connections.getClient(schema), id, { schema, userId: user.sub });
    this.events.publish('stock_transfer', 'received', { schema, entityId: id, actorUserId: user.sub });
    return withLinesToDto(transfer, canViewCosts(user.permissions));
  }

  /** A draft needs transfers.manage; cancelling one in transit moves goods back, so it needs transfers.approve. */
  @Post(':id/cancel')
  @RequirePermissions()
  @RequireAnyPermission(...VIEW)
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<StockTransferWithLinesDto> {
    const db = this.connections.getClient(schema);
    const current = await this.service.getById(db, id);
    const needed = current.status === 'in_transit' ? P.transfersApprove : P.transfersManage;
    if (!user.permissions.includes(needed)) {
      throw new ForbiddenException(`Missing required permission(s): ${needed}.`);
    }
    const transfer = await this.service.cancel(db, id, { schema, userId: user.sub });
    this.events.publish('stock_transfer', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
    return withLinesToDto(transfer, canViewCosts(user.permissions));
  }
}
