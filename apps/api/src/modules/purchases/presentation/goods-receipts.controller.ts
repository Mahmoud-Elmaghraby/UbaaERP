import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  goodsReceiptSchema,
  goodsReceiptWithLinesSchema,
  createGoodsReceiptSchema,
  type GoodsReceiptDto,
  type GoodsReceiptWithLinesDto,
  type CreateGoodsReceiptDto,
} from '@erp-platform/contracts';
import type { GoodsReceipt, GoodsReceiptWithLines } from '../domain/goods-receipt.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { GoodsReceiptsService } from '../application/services/goods-receipts.service';
import { PurchasesEventPublisher } from '../infrastructure/events/purchases-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';

function receiptToDto(receipt: GoodsReceipt): GoodsReceiptDto {
  return goodsReceiptSchema.parse(receipt);
}

function receiptWithLinesToDto(receipt: GoodsReceiptWithLines): GoodsReceiptWithLinesDto {
  return goodsReceiptWithLinesSchema.parse({
    ...receipt,
    lines: receipt.lines.map((line) => ({ ...line, unitCost: moneyToDto(line.unitCost) })),
  });
}

/** No PlanFeatureGuard yet — same deliberate, tracked gap as the rest of this module. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('purchases.manage')
@Controller('goods-receipts')
export class GoodsReceiptsController {
  constructor(
    private readonly service: GoodsReceiptsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: PurchasesEventPublisher,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('purchaseOrderId') purchaseOrderId?: string,
  ): Promise<GoodsReceiptDto[]> {
    const db = this.connections.getClient(schema);
    const receipts = purchaseOrderId
      ? await this.service.listByPurchaseOrderId(db, purchaseOrderId)
      : await this.service.list(db);
    return receipts.map(receiptToDto);
  }

  @Get(':id')
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<GoodsReceiptWithLinesDto> {
    const db = this.connections.getClient(schema);
    const receipt = await this.service.getById(db, id);
    return receiptWithLinesToDto(receipt);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createGoodsReceiptSchema)) body: CreateGoodsReceiptDto,
  ): Promise<GoodsReceiptWithLinesDto> {
    const db = this.connections.getClient(schema);
    const receipt = await this.service.create(db, {
      ...body,
      lines: body.lines.map((line) => ({
        ...line,
        unitCost: line.unitCost ? moneyFromDto(line.unitCost) : undefined,
      })),
    });
    this.events.publish('goods_receipt', 'created', { schema, entityId: receipt.id, actorUserId: user.sub });
    return receiptWithLinesToDto(receipt);
  }

  /**
   * The one-way door: confirms the receipt (GoodsReceiptsService also
   * recomputes the parent PO's status in the same DB transaction), then
   * publishes the integration event Inventory's GoodsReceiptStockListener
   * consumes to actually increase stock (CLAUDE.md §2.6 — never a direct
   * call from Purchases into Inventory). The event is published only
   * after the DB transaction has committed, same as every other
   * confirm/select action in this module.
   */
  @Post(':id/confirm')
  async confirm(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<GoodsReceiptWithLinesDto> {
    const db = this.connections.getClient(schema);
    const receipt = await this.service.confirm(db, id);
    this.events.publish('goods_receipt', 'confirmed', {
      schema,
      entityId: receipt.id,
      actorUserId: user.sub,
      metadata: {
        purchaseOrderId: receipt.purchaseOrderId,
        warehouseId: receipt.warehouseId,
        lines: receipt.lines.map((line) => ({
          productVariantId: line.productVariantId,
          quantity: line.quantityReceived,
          unitCost: moneyToDto(line.unitCost),
        })),
      },
    });
    return receiptWithLinesToDto(receipt);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<GoodsReceiptDto> {
    const db = this.connections.getClient(schema);
    const receipt = await this.service.cancel(db, id);
    this.events.publish('goods_receipt', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
    return receiptToDto(receipt);
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
    this.events.publish('goods_receipt', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
