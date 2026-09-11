import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  purchaseReturnSchema,
  purchaseReturnWithLinesSchema,
  createPurchaseReturnSchema,
  type PurchaseReturnDto,
  type PurchaseReturnWithLinesDto,
  type CreatePurchaseReturnDto,
} from '@erp-platform/contracts';
import type { PurchaseReturn, PurchaseReturnWithLines } from '../domain/purchase-return.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { PurchaseReturnsService } from '../application/services/purchase-returns.service';
import { PurchasesEventPublisher } from '../infrastructure/events/purchases-event-publisher';

function returnToDto(purchaseReturn: PurchaseReturn): PurchaseReturnDto {
  return purchaseReturnSchema.parse(purchaseReturn);
}

function returnWithLinesToDto(purchaseReturn: PurchaseReturnWithLines): PurchaseReturnWithLinesDto {
  return purchaseReturnWithLinesSchema.parse(purchaseReturn);
}

/**
 * No PlanFeatureGuard: intentionally excluded — a return is a post-invoice
 * adjustment, not one of the 4 optional pre-invoice document-chain steps
 * PlanFeatureGuard gates (see feature-catalog.ts).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('purchases.manage')
@Controller('purchase-returns')
export class PurchaseReturnsController {
  constructor(
    private readonly service: PurchaseReturnsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: PurchasesEventPublisher,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('goodsReceiptId') goodsReceiptId?: string,
  ): Promise<PurchaseReturnDto[]> {
    const db = this.connections.getClient(schema);
    const returns = goodsReceiptId
      ? await this.service.listByGoodsReceiptId(db, goodsReceiptId)
      : await this.service.list(db);
    return returns.map(returnToDto);
  }

  @Get(':id')
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<PurchaseReturnWithLinesDto> {
    const db = this.connections.getClient(schema);
    const purchaseReturn = await this.service.getById(db, id);
    return returnWithLinesToDto(purchaseReturn);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createPurchaseReturnSchema)) body: CreatePurchaseReturnDto,
  ): Promise<PurchaseReturnWithLinesDto> {
    const db = this.connections.getClient(schema);
    const purchaseReturn = await this.service.create(db, body);
    this.events.publish('purchase_return', 'created', {
      schema,
      entityId: purchaseReturn.id,
      actorUserId: user.sub,
    });
    return returnWithLinesToDto(purchaseReturn);
  }

  /**
   * The one-way door: confirms the return, then publishes the
   * integration event Inventory's PurchaseReturnStockListener consumes
   * to actually decrease stock (CLAUDE.md §2.6 — never a direct call
   * from Purchases into Inventory). Published only after the DB write
   * has committed, same as every other confirm action in this module.
   */
  @Post(':id/confirm')
  async confirm(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<PurchaseReturnWithLinesDto> {
    const db = this.connections.getClient(schema);
    const confirmation = await this.service.confirm(db, id);
    this.events.publish('purchase_return', 'confirmed', {
      schema,
      entityId: confirmation.id,
      actorUserId: user.sub,
      metadata: {
        goodsReceiptId: confirmation.goodsReceiptId,
        warehouseId: confirmation.warehouseId,
        lines: confirmation.lines.map((line) => ({
          productVariantId: line.productVariantId,
          quantity: line.quantityReturned,
        })),
      },
    });
    return returnWithLinesToDto(confirmation);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<PurchaseReturnDto> {
    const db = this.connections.getClient(schema);
    const purchaseReturn = await this.service.cancel(db, id);
    this.events.publish('purchase_return', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
    return returnToDto(purchaseReturn);
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
    this.events.publish('purchase_return', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
