import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  salesReturnSchema,
  salesReturnWithLinesSchema,
  salesReturnConfirmationSchema,
  createSalesReturnSchema,
  type SalesReturnDto,
  type SalesReturnWithLinesDto,
  type SalesReturnConfirmationDto,
  type CreateSalesReturnDto,
} from '@erp-platform/contracts';
import type { SalesReturn, SalesReturnWithLines, SalesReturnConfirmation } from '../domain/sales-return.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { SalesReturnsService } from '../application/services/sales-returns.service';
import { SalesEventPublisher } from '../infrastructure/events/sales-event-publisher';

function returnToDto(salesReturn: SalesReturn): SalesReturnDto {
  return salesReturnSchema.parse(salesReturn);
}

function returnWithLinesToDto(salesReturn: SalesReturnWithLines): SalesReturnWithLinesDto {
  return salesReturnWithLinesSchema.parse(salesReturn);
}

function confirmationToDto(confirmation: SalesReturnConfirmation): SalesReturnConfirmationDto {
  return salesReturnConfirmationSchema.parse(confirmation);
}

/** No PlanFeatureGuard yet — same deliberate, tracked gap as the rest of this module. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sales.manage')
@Controller('sales-returns')
export class SalesReturnsController {
  constructor(
    private readonly service: SalesReturnsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: SalesEventPublisher,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('deliveryId') deliveryId?: string,
  ): Promise<SalesReturnDto[]> {
    const db = this.connections.getClient(schema);
    const returns = deliveryId
      ? await this.service.listByDeliveryId(db, deliveryId)
      : await this.service.list(db);
    return returns.map(returnToDto);
  }

  @Get(':id')
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<SalesReturnWithLinesDto> {
    const db = this.connections.getClient(schema);
    const salesReturn = await this.service.getById(db, id);
    return returnWithLinesToDto(salesReturn);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createSalesReturnSchema)) body: CreateSalesReturnDto,
  ): Promise<SalesReturnWithLinesDto> {
    const db = this.connections.getClient(schema);
    const salesReturn = await this.service.create(db, body);
    this.events.publish('sales_return', 'created', { schema, entityId: salesReturn.id, actorUserId: user.sub });
    return returnWithLinesToDto(salesReturn);
  }

  /**
   * The one-way door — and, like PurchaseInvoicesController.post(), the
   * one action in this controller that does NOT call
   * this.events.publish(). Confirming now writes BOTH its integration
   * events to the Outbox inside SalesReturnsService.confirm() itself
   * (the stock fact AND the sales-credit-note financial fact),
   * atomically with the status flip and the credit note's own creation
   * (CLAUDE.md §2.7) — see that service's own comment. The response
   * includes the auto-generated credit note's id.
   */
  @Post(':id/confirm')
  async confirm(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<SalesReturnConfirmationDto> {
    const db = this.connections.getClient(schema);
    const confirmation = await this.service.confirm(db, id, schema, user.sub);
    return confirmationToDto(confirmation);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<SalesReturnDto> {
    const db = this.connections.getClient(schema);
    const salesReturn = await this.service.cancel(db, id);
    this.events.publish('sales_return', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
    return returnToDto(salesReturn);
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
    this.events.publish('sales_return', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
