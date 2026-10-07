import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  supplierPaymentSchema,
  supplierPaymentWithAllocationsSchema,
  supplierOutstandingInvoiceSchema,
  createSupplierPaymentSchema,
  allocateSupplierPaymentSchema,
  type SupplierPaymentDto,
  type SupplierPaymentWithAllocationsDto,
  type SupplierOutstandingInvoiceDto,
  type CreateSupplierPaymentDto,
  type AllocateSupplierPaymentDto,
} from '@erp-platform/contracts';
import type {
  SupplierOutstandingInvoice,
  SupplierPayment,
  SupplierPaymentWithAllocations,
} from '../domain/supplier-payment.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { SupplierPaymentsService } from '../application/services/supplier-payments.service';
import { PurchasesEventPublisher } from '../infrastructure/events/purchases-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';

function paymentToDto(payment: SupplierPayment): SupplierPaymentDto {
  return supplierPaymentSchema.parse({ ...payment, amount: moneyToDto(payment.amount) });
}

function paymentWithAllocationsToDto(payment: SupplierPaymentWithAllocations): SupplierPaymentWithAllocationsDto {
  return supplierPaymentWithAllocationsSchema.parse({
    ...payment,
    amount: moneyToDto(payment.amount),
    allocations: payment.allocations.map((a) => ({ ...a, allocatedAmount: moneyToDto(a.allocatedAmount) })),
    unallocatedAmount: moneyToDto(payment.unallocatedAmount),
  });
}

function outstandingToDto(invoice: SupplierOutstandingInvoice): SupplierOutstandingInvoiceDto {
  return supplierOutstandingInvoiceSchema.parse({
    ...invoice,
    totalAmount: moneyToDto(invoice.totalAmount),
    paidAmount: moneyToDto(invoice.paidAmount),
    outstandingAmount: moneyToDto(invoice.outstandingAmount),
  });
}

/**
 * No PlanFeatureGuard: intentionally excluded — paying a supplier is needed
 * to settle any purchase invoice regardless of plan, not an optional
 * document-chain step PlanFeatureGuard gates (see feature-catalog.ts).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('purchases.manage')
@Controller('supplier-payments')
export class SupplierPaymentsController {
  constructor(
    private readonly service: SupplierPaymentsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: PurchasesEventPublisher,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('supplierId') supplierId?: string,
  ): Promise<SupplierPaymentDto[]> {
    const db = this.connections.getClient(schema);
    const payments = supplierId ? await this.service.listBySupplierId(db, supplierId) : await this.service.list(db);
    return payments.map(paymentToDto);
  }

  /** Declared before ':id' so the literal path wins. Feeds the web allocation editor. */
  @Get('outstanding-invoices')
  async outstandingInvoices(
    @CurrentTenantSchema() schema: string,
    @Query('supplierId', new ParseUUIDPipe()) supplierId: string,
  ): Promise<SupplierOutstandingInvoiceDto[]> {
    const db = this.connections.getClient(schema);
    const invoices = await this.service.listOutstandingInvoices(db, supplierId);
    return invoices.map(outstandingToDto);
  }

  @Get(':id')
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<SupplierPaymentWithAllocationsDto> {
    const db = this.connections.getClient(schema);
    return paymentWithAllocationsToDto(await this.service.getById(db, id));
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createSupplierPaymentSchema)) body: CreateSupplierPaymentDto,
  ): Promise<SupplierPaymentWithAllocationsDto> {
    const db = this.connections.getClient(schema);
    const payment = await this.service.create(db, {
      ...body,
      amount: moneyFromDto(body.amount),
      allocations: body.allocations?.map((a) => ({ ...a, allocatedAmount: moneyFromDto(a.allocatedAmount) })),
    });
    this.events.publish('supplier_payment', 'created', { schema, entityId: payment.id, actorUserId: user.sub });
    return paymentWithAllocationsToDto(payment);
  }

  /** No events.publish() here: the service writes 'purchases.supplier_payment.posted' to the Outbox atomically (§2.7). */
  @Post(':id/post')
  async post(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<SupplierPaymentWithAllocationsDto> {
    const db = this.connections.getClient(schema);
    return paymentWithAllocationsToDto(await this.service.post(db, id, schema, user.sub));
  }

  /** Like post(), the 'allocated' event goes through the Outbox inside the service. */
  @Post(':id/allocate')
  async allocate(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(allocateSupplierPaymentSchema)) body: AllocateSupplierPaymentDto,
  ): Promise<SupplierPaymentWithAllocationsDto> {
    const db = this.connections.getClient(schema);
    const payment = await this.service.allocate(
      db,
      id,
      schema,
      user.sub,
      body.allocations.map((a) => ({ ...a, allocatedAmount: moneyFromDto(a.allocatedAmount) })),
    );
    return paymentWithAllocationsToDto(payment);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<SupplierPaymentDto> {
    const db = this.connections.getClient(schema);
    const payment = await this.service.cancel(db, id);
    this.events.publish('supplier_payment', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
    return paymentToDto(payment);
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
    this.events.publish('supplier_payment', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
