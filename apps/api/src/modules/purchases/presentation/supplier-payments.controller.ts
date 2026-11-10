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
  chequeDateSchema,
  type ChequeDateDto,
  type IssuedChequeDto,
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
import { PURCHASES_PERMISSIONS as PU } from '../../../shared/auth/trade-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { SupplierPaymentsService } from '../application/services/supplier-payments.service';
import { PurchasesEventPublisher } from '../infrastructure/events/purchases-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { assertFeatureOn } from '../../../shared/auth/assert-feature-on';
import { CheckDocumentDates } from '../../../shared/app-settings/document-date';

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
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@Controller('supplier-payments')
export class SupplierPaymentsController {
  constructor(
    private readonly service: SupplierPaymentsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: PurchasesEventPublisher,
  ) {}

  @Get()
  @RequirePermissions(PU.view)
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
  @RequirePermissions(PU.view)
  async outstandingInvoices(
    @CurrentTenantSchema() schema: string,
    @Query('supplierId', new ParseUUIDPipe()) supplierId: string,
  ): Promise<SupplierOutstandingInvoiceDto[]> {
    const db = this.connections.getClient(schema);
    const invoices = await this.service.listOutstandingInvoices(db, supplierId);
    return invoices.map(outstandingToDto);
  }

  /** أوراق الدفع: our cheques, outstanding or cleared. */
  @Get('cheques')
  @RequireFeature(FEATURE_KEYS.CHEQUES)
  @RequirePermissions(PU.view)
  async issuedCheques(@CurrentTenantSchema() schema: string, @Query('status') status?: string): Promise<IssuedChequeDto[]> {
    const db = this.connections.getClient(schema);
    let query = db
      .selectFrom('supplier_payments as p')
      .innerJoin('suppliers as s', 's.id', 'p.supplier_id')
      .leftJoin('treasuries as t', 't.id', 'p.treasury_id')
      .select(['p.id', 'p.payment_number', 'p.payment_date', 'p.supplier_id', 's.name as supplier_name', 'p.cheque_number', 'p.cheque_bank', 'p.cheque_due_date', 'p.cheque_status', 'p.cheque_status_date', 'p.amount_amount', 'p.amount_currency', 't.name as treasury_name'])
      .where('p.cheque_status', 'is not', null);
    if (status) query = query.where('p.cheque_status', '=', status);
    const rows = await query.orderBy('p.cheque_due_date').limit(2000).execute();
    return rows.map((r) => ({
      id: r.id,
      paymentNumber: r.payment_number,
      paymentDate: r.payment_date ? String(r.payment_date).slice(0, 10) : null,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      chequeNumber: r.cheque_number,
      bank: r.cheque_bank,
      dueDate: r.cheque_due_date ? String(r.cheque_due_date).slice(0, 10) : null,
      status: r.cheque_status as IssuedChequeDto['status'],
      statusDate: r.cheque_status_date ? String(r.cheque_status_date).slice(0, 10) : null,
      amount: { amountMinorUnits: r.amount_amount, currency: r.amount_currency },
      treasuryName: r.treasury_name,
    }));
  }

  @Get(':id')
  @RequirePermissions(PU.view)
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<SupplierPaymentWithAllocationsDto> {
    const db = this.connections.getClient(schema);
    return paymentWithAllocationsToDto(await this.service.getById(db, id));
  }

  @Post()
  @CheckDocumentDates('paymentDate')
  @RequirePermissions(PU.create)
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createSupplierPaymentSchema)) body: CreateSupplierPaymentDto,
  ): Promise<SupplierPaymentWithAllocationsDto> {
    if (body.paymentMethod === 'check') assertFeatureOn(user, FEATURE_KEYS.CHEQUES);
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
  @Post(':id/clear-cheque')
  @RequireFeature(FEATURE_KEYS.CHEQUES)
  @RequirePermissions(PU.post)
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearCheque(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(chequeDateSchema)) body: ChequeDateDto,
  ): Promise<void> {
    await this.service.clearCheque(this.connections.getClient(schema), id, body.date, { schema, actorUserId: user.sub });
  }

  @Post(':id/post')
  @RequirePermissions(PU.post)
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
  @RequirePermissions(PU.post)
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
  @RequirePermissions(PU.cancel)
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
  @RequirePermissions(PU.cancel)
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
