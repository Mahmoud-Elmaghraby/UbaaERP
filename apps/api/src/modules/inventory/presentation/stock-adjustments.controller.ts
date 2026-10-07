import {
  Body,
  Controller,
  Delete,
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
  createStockAdjustmentReasonSchema,
  createStockAdjustmentSchema,
  stockAdjustmentReasonSchema,
  stockAdjustmentSchema,
  stockAdjustmentStatusSchema,
  stockAdjustmentWithLinesSchema,
  updateStockAdjustmentReasonSchema,
  updateStockAdjustmentSchema,
  type CreateStockAdjustmentDto,
  type CreateStockAdjustmentReasonDto,
  type StockAdjustmentDto,
  type StockAdjustmentReasonDto,
  type StockAdjustmentWithLinesDto,
  type UpdateStockAdjustmentDto,
  type UpdateStockAdjustmentReasonDto,
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
import { StockAdjustmentsService } from '../application/services/stock-adjustments.service';
import type { CreateStockAdjustmentInput, StockAdjustmentWithLines } from '../domain/stock-adjustment.entity';
import { InventoryEventPublisher } from '../infrastructure/events/inventory-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';

function withLinesToDto(adjustment: StockAdjustmentWithLines, showCost: boolean): StockAdjustmentWithLinesDto {
  return stockAdjustmentWithLinesSchema.parse({
    ...adjustment,
    lines: adjustment.lines.map((line) => ({
      ...line,
      unitCost: showCost && line.unitCost ? moneyToDto(line.unitCost) : null,
      postedValue: showCost && line.postedValue ? moneyToDto(line.postedValue) : null,
    })),
  });
}

function inputFromDto(body: UpdateStockAdjustmentDto): Partial<CreateStockAdjustmentInput> {
  return {
    ...body,
    lines: body.lines?.map((line) => ({ ...line, unitCost: line.unitCost ? moneyFromDto(line.unitCost) : null })),
  };
}

/** Adjustment reasons — readable by anyone who adjusts stock, managed in inventory settings. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(P.settingsManage)
@Controller('stock-adjustment-reasons')
export class StockAdjustmentReasonsController {
  constructor(
    private readonly service: StockAdjustmentsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(P.movementsManage, P.settingsManage, P.stockView)
  async list(@CurrentTenantSchema() schema: string): Promise<StockAdjustmentReasonDto[]> {
    const reasons = await this.service.listReasons(this.connections.getClient(schema));
    return reasons.map((reason) => stockAdjustmentReasonSchema.parse(reason));
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(createStockAdjustmentReasonSchema)) body: CreateStockAdjustmentReasonDto,
  ): Promise<StockAdjustmentReasonDto> {
    return stockAdjustmentReasonSchema.parse(await this.service.createReason(this.connections.getClient(schema), body));
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStockAdjustmentReasonSchema)) body: UpdateStockAdjustmentReasonDto,
  ): Promise<StockAdjustmentReasonDto> {
    return stockAdjustmentReasonSchema.parse(
      await this.service.updateReason(this.connections.getClient(schema), id, body),
    );
  }

  /** Deletes an unused reason; a used one is deactivated instead (`deleted: false`). */
  @Delete(':id')
  async delete(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<{ deleted: boolean }> {
    return this.service.deleteReason(this.connections.getClient(schema), id);
  }
}

/** Stock adjustment documents (إذن إضافة / صرف — migration 0084). */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(P.movementsManage)
@Controller('stock-adjustments')
export class StockAdjustmentsController {
  constructor(
    private readonly service: StockAdjustmentsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: InventoryEventPublisher,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(P.movementsManage, P.stockView)
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
  ): Promise<StockAdjustmentDto[]> {
    const rows = await this.service.list(this.connections.getClient(schema), {
      status: stockAdjustmentStatusSchema.safeParse(status).data,
      warehouseId,
    });
    return rows.map((row) => stockAdjustmentSchema.parse(row));
  }

  @Get(':id')
  @RequirePermissions()
  @RequireAnyPermission(P.movementsManage, P.stockView)
  async get(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<StockAdjustmentWithLinesDto> {
    const adjustment = await this.service.getById(this.connections.getClient(schema), id);
    return withLinesToDto(adjustment, canViewCosts(user.permissions));
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createStockAdjustmentSchema)) body: CreateStockAdjustmentDto,
  ): Promise<StockAdjustmentWithLinesDto> {
    const db = this.connections.getClient(schema);
    const { post, ...rest } = body;
    const input = inputFromDto(rest) as CreateStockAdjustmentInput;
    const adjustment = post
      ? await this.service.createAndPost(db, input, { schema, userId: user.sub })
      : await this.service.create(db, input, user.sub);
    this.events.publish('stock_adjustment', post ? 'posted' : 'created', {
      schema,
      entityId: adjustment.id,
      actorUserId: user.sub,
    });
    return withLinesToDto(adjustment, canViewCosts(user.permissions));
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStockAdjustmentSchema)) body: UpdateStockAdjustmentDto,
  ): Promise<StockAdjustmentWithLinesDto> {
    const adjustment = await this.service.update(this.connections.getClient(schema), id, inputFromDto(body));
    return withLinesToDto(adjustment, canViewCosts(user.permissions));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    await this.service.delete(this.connections.getClient(schema), id);
  }

  @Post(':id/post')
  async post(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<StockAdjustmentWithLinesDto> {
    const adjustment = await this.service.post(this.connections.getClient(schema), id, { schema, userId: user.sub });
    this.events.publish('stock_adjustment', 'posted', { schema, entityId: id, actorUserId: user.sub });
    return withLinesToDto(adjustment, canViewCosts(user.permissions));
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<StockAdjustmentWithLinesDto> {
    const adjustment = await this.service.cancel(this.connections.getClient(schema), id);
    return withLinesToDto(adjustment, canViewCosts(user.permissions));
  }
}
