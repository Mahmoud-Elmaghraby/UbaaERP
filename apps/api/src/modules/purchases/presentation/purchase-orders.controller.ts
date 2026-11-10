import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { DocumentShareLinkDto } from '@erp-platform/contracts';
import { DocumentShareService } from '../../../shared/printing/document-share.service';
import { BusinessRuleError } from '../../../shared/errors/domain-errors';
import {
  purchaseOrderSchema,
  purchaseOrderWithLinesSchema,
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  type PurchaseOrderDto,
  type PurchaseOrderWithLinesDto,
  type CreatePurchaseOrderDto,
  type UpdatePurchaseOrderDto,
} from '@erp-platform/contracts';
import type { PurchaseOrder, PurchaseOrderWithLines } from '../domain/purchase-order.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { PURCHASES_PERMISSIONS as PU } from '../../../shared/auth/trade-permissions';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { PurchaseOrdersService } from '../application/services/purchase-orders.service';
import { PurchasesEventPublisher } from '../infrastructure/events/purchases-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';
import type { PurchaseLimitsCheckDto } from '@erp-platform/contracts';

function orderToDto(order: PurchaseOrder): PurchaseOrderDto {
  return purchaseOrderSchema.parse(order);
}

function orderWithLinesToDto(order: PurchaseOrderWithLines): PurchaseOrderWithLinesDto {
  return purchaseOrderWithLinesSchema.parse({
    ...order,
    lines: order.lines.map((line) => ({ ...line, unitPrice: moneyToDto(line.unitPrice) })),
    totalAmount: moneyToDto(order.totalAmount),
  });
}

/** Optional document-chain module — gated by PlanFeatureGuard (PURCHASES_PURCHASE_ORDERS). */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequireFeature(FEATURE_KEYS.PURCHASES_PURCHASE_ORDERS)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly service: PurchaseOrdersService,
    private readonly connections: TenantConnectionManager,
    private readonly events: PurchasesEventPublisher,
    private readonly shares: DocumentShareService,
  ) {}

  @Get()
  @RequirePermissions(PU.view)
  async list(@CurrentTenantSchema() schema: string): Promise<PurchaseOrderDto[]> {
    const db = this.connections.getClient(schema);
    const orders = await this.service.list(db);
    return orders.map(orderToDto);
  }

  @Get(':id/limits-check')
  @RequirePermissions(PU.view)
  limitsCheck(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<PurchaseLimitsCheckDto> {
    return this.service.limitsCheck(this.connections.getClient(schema), id, user.permissions);
  }

  @Get(':id')
  @RequirePermissions(PU.view)
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<PurchaseOrderWithLinesDto> {
    const db = this.connections.getClient(schema);
    const order = await this.service.getById(db, id);
    return orderWithLinesToDto(order);
  }

  /** A public, signed link to the printed order (WhatsApp share to the supplier). */
  @Post(':id/share-link')
  @RequirePermissions(PU.view)
  async shareLink(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('origin') origin?: string,
  ): Promise<DocumentShareLinkDto> {
    const order = await this.service.getById(this.connections.getClient(schema), id);
    if (order.status === 'cancelled') {
      throw new BusinessRuleError('A cancelled document cannot be shared.', { code: 'DOCUMENT_SHARE.CANCELLED' });
    }
    return this.shares.createLink(schema, 'purchase_order', id, origin);
  }

  @Post()
  @RequirePermissions(PU.create)
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createPurchaseOrderSchema)) body: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrderWithLinesDto> {
    const db = this.connections.getClient(schema);
    const order = await this.service.create(
      db,
      {
        ...body,
        lines: body.lines?.map((line) => ({ ...line, unitPrice: moneyFromDto(line.unitPrice) })),
      },
      schema,
    );
    this.events.publish('purchase_order', 'created', { schema, entityId: order.id, actorUserId: user.sub });
    return orderWithLinesToDto(order);
  }

  @Patch(':id')
  @RequirePermissions(PU.create)
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePurchaseOrderSchema)) body: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderWithLinesDto> {
    const db = this.connections.getClient(schema);
    const order = await this.service.update(
      db,
      id,
      {
        ...body,
        lines: body.lines?.map((line) => ({ ...line, unitPrice: moneyFromDto(line.unitPrice) })),
      },
      schema,
    );
    this.events.publish('purchase_order', 'updated', { schema, entityId: id, actorUserId: user.sub });
    return orderWithLinesToDto(order);
  }

  @Post(':id/confirm')
  @RequirePermissions(PU.post)
  async confirm(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<PurchaseOrderDto> {
    const db = this.connections.getClient(schema);
    const order = await this.service.confirm(db, id, { permissions: user.permissions });
    this.events.publish('purchase_order', 'confirmed', { schema, entityId: id, actorUserId: user.sub });
    return orderToDto(order);
  }

  @Post(':id/cancel')
  @RequirePermissions(PU.cancel)
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<PurchaseOrderDto> {
    const db = this.connections.getClient(schema);
    const order = await this.service.cancel(db, id);
    this.events.publish('purchase_order', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
    return orderToDto(order);
  }

  @Delete(':id')
  @RequirePermissions(PU.cancel)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id);
    this.events.publish('purchase_order', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
