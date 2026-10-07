import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createStockCountSchema,
  loadStockCountSchema,
  stockCountKindSchema,
  stockCountSchema,
  stockCountWithLinesSchema,
  updateStockCountSchema,
  upsertStockCountLinesSchema,
  type CreateStockCountDto,
  type LoadStockCountDto,
  type StockCountDto,
  type StockCountWithLinesDto,
  type UpdateStockCountDto,
  type UpsertStockCountLinesDto,
} from '@erp-platform/contracts';
import type { StockCount, StockCountWithLines } from '../domain/stock-count.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { INVENTORY_PERMISSIONS as P } from '../../../shared/auth/inventory-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { StockCountsService } from '../application/services/stock-counts.service';
import { InventoryEventPublisher } from '../infrastructure/events/inventory-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';

function countToDto(count: StockCount): StockCountDto {
  return stockCountSchema.parse(count);
}

function countWithLinesToDto(count: StockCountWithLines): StockCountWithLinesDto {
  return stockCountWithLinesSchema.parse({
    ...count,
    lines: count.lines.map((line) => ({ ...line, unitCost: line.unitCost ? moneyToDto(line.unitCost) : null })),
  });
}

/** Opening balances (رصيد أول المدة) and stocktakes (الجرد) — see StockCountsService. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(P.countsManage)
@Controller('stock-counts')
export class StockCountsController {
  constructor(
    private readonly service: StockCountsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: InventoryEventPublisher,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(P.countsManage, P.countsPost)
  async list(@CurrentTenantSchema() schema: string, @Query('kind') kind?: string): Promise<StockCountDto[]> {
    const parsedKind = kind ? stockCountKindSchema.parse(kind) : undefined;
    const counts = await this.service.list(this.connections.getClient(schema), parsedKind);
    return counts.map(countToDto);
  }

  @Get(':id')
  @RequirePermissions()
  @RequireAnyPermission(P.countsManage, P.countsPost)
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<StockCountWithLinesDto> {
    return countWithLinesToDto(await this.service.getById(this.connections.getClient(schema), id));
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createStockCountSchema)) body: CreateStockCountDto,
  ): Promise<StockCountWithLinesDto> {
    const count = await this.service.create(this.connections.getClient(schema), body, user.sub);
    this.events.publish('stock_count', 'created', { schema, entityId: count.id, actorUserId: user.sub });
    return countWithLinesToDto(count);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStockCountSchema)) body: UpdateStockCountDto,
  ): Promise<StockCountDto> {
    return countToDto(await this.service.updateHeader(this.connections.getClient(schema), id, body));
  }

  /** Add or update lines (typed, scanned or pasted from Excel). */
  @Post(':id/lines')
  async upsertLines(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(upsertStockCountLinesSchema)) body: UpsertStockCountLinesDto,
  ): Promise<StockCountWithLinesDto> {
    const count = await this.service.upsertLines(
      this.connections.getClient(schema),
      id,
      body.lines.map((line) => ({
        ...line,
        unitCost: line.unitCost ? moneyFromDto(line.unitCost) : null,
      })),
    );
    return countWithLinesToDto(count);
  }

  @Delete(':id/lines/:lineId')
  @HttpCode(204)
  async deleteLine(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ): Promise<void> {
    await this.service.deleteLine(this.connections.getClient(schema), id, lineId);
  }

  /** Stocktake: add every item with stock in the warehouse that isn't on the count yet. */
  @Post(':id/load-stock')
  async loadStock(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(loadStockCountSchema)) body: LoadStockCountDto,
  ): Promise<StockCountWithLinesDto> {
    return countWithLinesToDto(await this.service.loadStock(this.connections.getClient(schema), id, body));
  }

  @Post(':id/refresh')
  async refresh(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<StockCountWithLinesDto> {
    return countWithLinesToDto(await this.service.refreshSystemQuantities(this.connections.getClient(schema), id));
  }

  /** One-way: moves the stock. */
  @Post(':id/post')
  @RequirePermissions(P.countsPost)
  async post(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<StockCountWithLinesDto> {
    const { count } = await this.service.post(this.connections.getClient(schema), id, schema, user.sub);
    this.events.publish('stock_count', 'posted', { schema, entityId: id, actorUserId: user.sub });
    return countWithLinesToDto(count);
  }

  @Post(':id/cancel')
  async cancel(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<StockCountDto> {
    return countToDto(await this.service.cancel(this.connections.getClient(schema), id));
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    await this.service.delete(this.connections.getClient(schema), id);
  }
}
