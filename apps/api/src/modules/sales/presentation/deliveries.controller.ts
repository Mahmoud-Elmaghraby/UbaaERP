import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  deliverySchema,
  deliveryWithLinesSchema,
  createDeliverySchema,
  type DeliveryDto,
  type DeliveryWithLinesDto,
  type CreateDeliveryDto,
} from '@erp-platform/contracts';
import type { Delivery, DeliveryWithLines } from '../domain/delivery.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { DeliveriesService } from '../application/services/deliveries.service';
import { SalesEventPublisher } from '../infrastructure/events/sales-event-publisher';

function deliveryToDto(delivery: Delivery): DeliveryDto {
  return deliverySchema.parse(delivery);
}

export function deliveryWithLinesToDto(delivery: DeliveryWithLines): DeliveryWithLinesDto {
  return deliveryWithLinesSchema.parse(delivery);
}

/** No PlanFeatureGuard yet — same deliberate, tracked gap as the rest of this module. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sales.manage')
@Controller('deliveries')
export class DeliveriesController {
  constructor(
    private readonly service: DeliveriesService,
    private readonly connections: TenantConnectionManager,
    private readonly events: SalesEventPublisher,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('salesOrderId') salesOrderId?: string,
  ): Promise<DeliveryDto[]> {
    const db = this.connections.getClient(schema);
    const deliveries = salesOrderId
      ? await this.service.listBySalesOrderId(db, salesOrderId)
      : await this.service.list(db);
    return deliveries.map(deliveryToDto);
  }

  @Get(':id')
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<DeliveryWithLinesDto> {
    const db = this.connections.getClient(schema);
    const delivery = await this.service.getById(db, id);
    return deliveryWithLinesToDto(delivery);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createDeliverySchema)) body: CreateDeliveryDto,
  ): Promise<DeliveryWithLinesDto> {
    const db = this.connections.getClient(schema);
    const delivery = await this.service.create(db, body);
    this.events.publish('delivery', 'created', { schema, entityId: delivery.id, actorUserId: user.sub });
    return deliveryWithLinesToDto(delivery);
  }

  /**
   * The one-way door — and, like PurchaseInvoicesController.post(), the
   * one action in this controller that does NOT call
   * this.events.publish(). Confirming writes its integration event to
   * the Outbox inside DeliveriesService.confirm() itself, atomically
   * with the status flip (CLAUDE.md §2.7) — this now feeds both
   * Inventory's stock decrease and, transitively, Accounting's COGS
   * auto-posting (Stage 6), so it needs Outbox's never-silently-lost
   * guarantee. OutboxDispatcherService is what actually puts
   * 'sales.delivery.confirmed' on the Event Bus, on its own schedule.
   */
  @Post(':id/confirm')
  async confirm(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<DeliveryWithLinesDto> {
    const db = this.connections.getClient(schema);
    const delivery = await this.service.confirm(db, id, schema, user.sub);
    return deliveryWithLinesToDto(delivery);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<DeliveryDto> {
    const db = this.connections.getClient(schema);
    const delivery = await this.service.cancel(db, id);
    this.events.publish('delivery', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
    return deliveryToDto(delivery);
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
    this.events.publish('delivery', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
