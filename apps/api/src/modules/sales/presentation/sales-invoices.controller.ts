import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  salesInvoiceSchema,
  salesInvoiceWithLinesSchema,
  createSalesInvoiceSchema,
  type SalesInvoiceDto,
  type SalesInvoiceWithLinesDto,
  type CreateSalesInvoiceDto,
} from '@erp-platform/contracts';
import type { SalesInvoice, SalesInvoiceWithLines } from '../domain/sales-invoice.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { SalesInvoicesService } from '../application/services/sales-invoices.service';
import { SalesEventPublisher } from '../infrastructure/events/sales-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';

function invoiceToDto(invoice: SalesInvoice): SalesInvoiceDto {
  return salesInvoiceSchema.parse(invoice);
}

export function invoiceWithLinesToDto(invoice: SalesInvoiceWithLines): SalesInvoiceWithLinesDto {
  return salesInvoiceWithLinesSchema.parse({
    ...invoice,
    lines: invoice.lines.map((line) => ({ ...line, unitPrice: moneyToDto(line.unitPrice) })),
    totalAmount: moneyToDto(invoice.totalAmount),
  });
}

/**
 * No PlanFeatureGuard: intentionally excluded — the invoice is the one
 * mandatory document in the Sales chain and is deliberately never
 * gate-able (see feature-catalog.ts's class comment).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sales.manage')
@Controller('sales-invoices')
export class SalesInvoicesController {
  constructor(
    private readonly service: SalesInvoicesService,
    private readonly connections: TenantConnectionManager,
    private readonly events: SalesEventPublisher,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('salesOrderId') salesOrderId?: string,
  ): Promise<SalesInvoiceDto[]> {
    const db = this.connections.getClient(schema);
    const invoices = salesOrderId
      ? await this.service.listBySalesOrderId(db, salesOrderId)
      : await this.service.list(db);
    return invoices.map(invoiceToDto);
  }

  @Get(':id')
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<SalesInvoiceWithLinesDto> {
    const db = this.connections.getClient(schema);
    const invoice = await this.service.getById(db, id);
    return invoiceWithLinesToDto(invoice);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createSalesInvoiceSchema)) body: CreateSalesInvoiceDto,
  ): Promise<SalesInvoiceWithLinesDto> {
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
    this.events.publish('sales_invoice', 'created', { schema, entityId: invoice.id, actorUserId: user.sub });
    return invoiceWithLinesToDto(invoice);
  }

  /**
   * The one-way door — and the one action in this whole module that
   * does NOT call `this.events.publish()`. Posting writes its
   * integration event to the Outbox inside SalesInvoicesService.post()
   * itself, atomically with the status flip (CLAUDE.md §2.7); publishing
   * it here, after the fact, the way every other confirm/select action
   * does would reintroduce exactly the "might silently never happen"
   * risk Outbox exists to remove. OutboxDispatcherService (shared/outbox/)
   * is what actually puts 'sales.sales_invoice.posted' on the Event Bus,
   * on its own schedule.
   */
  @Post(':id/post')
  async post(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<SalesInvoiceWithLinesDto> {
    const db = this.connections.getClient(schema);
    const invoice = await this.service.post(db, id, schema, user.sub);
    return invoiceWithLinesToDto(invoice);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<SalesInvoiceDto> {
    const db = this.connections.getClient(schema);
    const invoice = await this.service.cancel(db, id);
    this.events.publish('sales_invoice', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
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
    this.events.publish('sales_invoice', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
