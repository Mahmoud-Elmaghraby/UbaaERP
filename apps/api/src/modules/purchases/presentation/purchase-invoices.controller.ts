import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  purchaseInvoiceSchema,
  purchaseInvoiceWithLinesSchema,
  createPurchaseInvoiceSchema,
  type PurchaseInvoiceDto,
  type PurchaseInvoiceWithLinesDto,
  type CreatePurchaseInvoiceDto,
} from '@erp-platform/contracts';
import type { PurchaseInvoice, PurchaseInvoiceWithLines } from '../domain/purchase-invoice.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { PurchaseInvoicesService } from '../application/services/purchase-invoices.service';
import { PurchasesEventPublisher } from '../infrastructure/events/purchases-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';

function invoiceToDto(invoice: PurchaseInvoice): PurchaseInvoiceDto {
  return purchaseInvoiceSchema.parse(invoice);
}

function invoiceWithLinesToDto(invoice: PurchaseInvoiceWithLines): PurchaseInvoiceWithLinesDto {
  return purchaseInvoiceWithLinesSchema.parse({
    ...invoice,
    lines: invoice.lines.map((line) => ({ ...line, unitPrice: moneyToDto(line.unitPrice) })),
    totalAmount: moneyToDto(invoice.totalAmount),
  });
}

/** No PlanFeatureGuard yet — same deliberate, tracked gap as the rest of this module. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('purchases.manage')
@Controller('purchase-invoices')
export class PurchaseInvoicesController {
  constructor(
    private readonly service: PurchaseInvoicesService,
    private readonly connections: TenantConnectionManager,
    private readonly events: PurchasesEventPublisher,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('purchaseOrderId') purchaseOrderId?: string,
  ): Promise<PurchaseInvoiceDto[]> {
    const db = this.connections.getClient(schema);
    const invoices = purchaseOrderId
      ? await this.service.listByPurchaseOrderId(db, purchaseOrderId)
      : await this.service.list(db);
    return invoices.map(invoiceToDto);
  }

  @Get(':id')
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<PurchaseInvoiceWithLinesDto> {
    const db = this.connections.getClient(schema);
    const invoice = await this.service.getById(db, id);
    return invoiceWithLinesToDto(invoice);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createPurchaseInvoiceSchema)) body: CreatePurchaseInvoiceDto,
  ): Promise<PurchaseInvoiceWithLinesDto> {
    const db = this.connections.getClient(schema);
    const invoice = await this.service.create(
      db,
      {
        ...body,
        lines: body.lines?.map((line) => ({
          ...line,
          unitPrice: line.unitPrice ? moneyFromDto(line.unitPrice) : undefined,
        })),
        directLines: body.directLines?.map((line) => ({
          ...line,
          unitPrice: moneyFromDto(line.unitPrice),
        })),
      },
      schema,
      user.sub,
    );
    this.events.publish('purchase_invoice', 'created', { schema, entityId: invoice.id, actorUserId: user.sub });
    return invoiceWithLinesToDto(invoice);
  }

  /**
   * The one-way door — and the one action in this whole module that
   * does NOT call `this.events.publish()`. Posting writes its
   * integration event to the Outbox inside PurchaseInvoicesService.post()
   * itself, atomically with the status flip (CLAUDE.md §2.7); publishing
   * it here, after the fact, the way every other confirm/select action
   * does would reintroduce exactly the "might silently never happen"
   * risk Outbox exists to remove. OutboxDispatcherService (shared/outbox/)
   * is what actually puts 'purchases.purchase_invoice.posted' on the
   * Event Bus, on its own schedule.
   */
  @Post(':id/post')
  async post(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<PurchaseInvoiceWithLinesDto> {
    const db = this.connections.getClient(schema);
    const invoice = await this.service.post(db, id, schema, user.sub);
    return invoiceWithLinesToDto(invoice);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<PurchaseInvoiceDto> {
    const db = this.connections.getClient(schema);
    const invoice = await this.service.cancel(db, id);
    this.events.publish('purchase_invoice', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
    return invoiceToDto(invoice);
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
    this.events.publish('purchase_invoice', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
