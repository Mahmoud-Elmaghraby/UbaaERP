import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  salesOrderSchema,
  salesOrderWithLinesSchema,
  createSalesOrderSchema,
  updateSalesOrderSchema,
  type SalesOrderDto,
  type SalesOrderWithLinesDto,
  type CreateSalesOrderDto,
  type UpdateSalesOrderDto,
} from '@erp-platform/contracts';
import type { SalesOrder, SalesOrderWithLines } from '../domain/sales-order.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { SalesOrdersService } from '../application/services/sales-orders.service';
import { SalesEventPublisher } from '../infrastructure/events/sales-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';

function orderToDto(order: SalesOrder): SalesOrderDto {
  return salesOrderSchema.parse({
    ...order,
    discountFixedAmount: order.discountFixedAmount ? moneyToDto(order.discountFixedAmount) : null,
  });
}

export function orderWithLinesToDto(order: SalesOrderWithLines): SalesOrderWithLinesDto {
  return salesOrderWithLinesSchema.parse({
    ...order,
    discountFixedAmount: order.discountFixedAmount ? moneyToDto(order.discountFixedAmount) : null,
    lines: order.lines.map((line) => ({
      ...line,
      unitPrice: moneyToDto(line.unitPrice),
      discountFixedAmount: line.discountFixedAmount ? moneyToDto(line.discountFixedAmount) : null,
    })),
    subtotalAmount: moneyToDto(order.subtotalAmount),
    totalAmount: moneyToDto(order.totalAmount),
  });
}

/** Optional document-chain module — gated by PlanFeatureGuard (SALES_SALES_ORDERS). */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequirePermissions('sales.manage')
@RequireFeature(FEATURE_KEYS.SALES_SALES_ORDERS)
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(
    private readonly service: SalesOrdersService,
    private readonly connections: TenantConnectionManager,
    private readonly events: SalesEventPublisher,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<SalesOrderDto[]> {
    const db = this.connections.getClient(schema);
    const orders = await this.service.list(db);
    return orders.map(orderToDto);
  }

  @Get(':id')
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<SalesOrderWithLinesDto> {
    const db = this.connections.getClient(schema);
    const order = await this.service.getById(db, id);
    return orderWithLinesToDto(order);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createSalesOrderSchema)) body: CreateSalesOrderDto,
  ): Promise<SalesOrderWithLinesDto> {
    const db = this.connections.getClient(schema);
    const order = await this.service.create(
      db,
      {
        ...body,
        discountFixedAmount: body.discountFixedAmount ? moneyFromDto(body.discountFixedAmount) : body.discountFixedAmount,
        lines: body.lines?.map((line) => ({
          ...line,
          unitPrice: moneyFromDto(line.unitPrice),
          discountFixedAmount: line.discountFixedAmount ? moneyFromDto(line.discountFixedAmount) : line.discountFixedAmount,
        })),
      },
      schema,
    );
    this.events.publish('sales_order', 'created', { schema, entityId: order.id, actorUserId: user.sub });
    return orderWithLinesToDto(order);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSalesOrderSchema)) body: UpdateSalesOrderDto,
  ): Promise<SalesOrderWithLinesDto> {
    const db = this.connections.getClient(schema);
    const order = await this.service.update(
      db,
      id,
      {
        ...body,
        discountFixedAmount: body.discountFixedAmount ? moneyFromDto(body.discountFixedAmount) : body.discountFixedAmount,
        lines: body.lines?.map((line) => ({
          ...line,
          unitPrice: moneyFromDto(line.unitPrice),
          discountFixedAmount: line.discountFixedAmount ? moneyFromDto(line.discountFixedAmount) : line.discountFixedAmount,
        })),
      },
      schema,
    );
    this.events.publish('sales_order', 'updated', { schema, entityId: id, actorUserId: user.sub });
    return orderWithLinesToDto(order);
  }

  @Post(':id/confirm')
  async confirm(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<SalesOrderDto> {
    const db = this.connections.getClient(schema);
    const order = await this.service.confirm(db, id);
    this.events.publish('sales_order', 'confirmed', { schema, entityId: id, actorUserId: user.sub });
    return orderToDto(order);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<SalesOrderDto> {
    const db = this.connections.getClient(schema);
    const order = await this.service.cancel(db, id);
    this.events.publish('sales_order', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
    return orderToDto(order);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id);
    this.events.publish('sales_order', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
