import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  paymentReceivedSchema,
  paymentReceivedWithAllocationsSchema,
  createPaymentReceivedSchema,
  allocatePaymentReceivedSchema,
  type PaymentReceivedDto,
  type PaymentReceivedWithAllocationsDto,
  type CreatePaymentReceivedDto,
  type AllocatePaymentReceivedDto,
} from '@erp-platform/contracts';
import type { PaymentReceived, PaymentReceivedWithAllocations } from '../domain/payment-received.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { PaymentsReceivedService } from '../application/services/payments-received.service';
import { SalesEventPublisher } from '../infrastructure/events/sales-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';

function paymentToDto(payment: PaymentReceived): PaymentReceivedDto {
  return paymentReceivedSchema.parse({ ...payment, amount: moneyToDto(payment.amount) });
}

function paymentWithAllocationsToDto(
  payment: PaymentReceivedWithAllocations,
): PaymentReceivedWithAllocationsDto {
  return paymentReceivedWithAllocationsSchema.parse({
    ...payment,
    amount: moneyToDto(payment.amount),
    allocations: payment.allocations.map((allocation) => ({
      ...allocation,
      allocatedAmount: moneyToDto(allocation.allocatedAmount),
    })),
    unallocatedAmount: moneyToDto(payment.unallocatedAmount),
  });
}

/** No PlanFeatureGuard yet — same deliberate, tracked gap as the rest of this module. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sales.manage')
@Controller('payments-received')
export class PaymentsReceivedController {
  constructor(
    private readonly service: PaymentsReceivedService,
    private readonly connections: TenantConnectionManager,
    private readonly events: SalesEventPublisher,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('customerId') customerId?: string,
  ): Promise<PaymentReceivedDto[]> {
    const db = this.connections.getClient(schema);
    const payments = customerId
      ? await this.service.listByCustomerId(db, customerId)
      : await this.service.list(db);
    return payments.map(paymentToDto);
  }

  @Get(':id')
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<PaymentReceivedWithAllocationsDto> {
    const db = this.connections.getClient(schema);
    const payment = await this.service.getById(db, id);
    return paymentWithAllocationsToDto(payment);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createPaymentReceivedSchema)) body: CreatePaymentReceivedDto,
  ): Promise<PaymentReceivedWithAllocationsDto> {
    const db = this.connections.getClient(schema);
    const payment = await this.service.create(db, {
      ...body,
      amount: moneyFromDto(body.amount),
      allocations: body.allocations?.map((allocation) => ({
        ...allocation,
        allocatedAmount: moneyFromDto(allocation.allocatedAmount),
      })),
    });
    this.events.publish('payment_received', 'created', { schema, entityId: payment.id, actorUserId: user.sub });
    return paymentWithAllocationsToDto(payment);
  }

  /**
   * The one-way door — and the one action in this whole module that
   * does NOT call `this.events.publish()`. Posting writes its
   * integration event to the Outbox inside PaymentsReceivedService.post()
   * itself, atomically with the status flip (CLAUDE.md §2.7); publishing
   * it here, after the fact, the way every other confirm/select action
   * does would reintroduce exactly the "might silently never happen"
   * risk Outbox exists to remove. OutboxDispatcherService (shared/outbox/)
   * is what actually puts 'sales.payment_received.posted' on the Event
   * Bus, on its own schedule.
   */
  @Post(':id/post')
  async post(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<PaymentReceivedWithAllocationsDto> {
    const db = this.connections.getClient(schema);
    const payment = await this.service.post(db, id, schema, user.sub);
    return paymentWithAllocationsToDto(payment);
  }

  /**
   * Applies this (already posted) payment's unallocated remainder to
   * one or more additional sales invoices — closes the gap
   * PaymentsReceivedService's class comment used to flag as deferred.
   * Like post(), this does NOT call this.events.publish(): the new
   * allocation rows are written to the Outbox atomically inside
   * PaymentsReceivedService.allocate() itself (CLAUDE.md §2.7).
   */
  @Post(':id/allocate')
  async allocate(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(allocatePaymentReceivedSchema)) body: AllocatePaymentReceivedDto,
  ): Promise<PaymentReceivedWithAllocationsDto> {
    const db = this.connections.getClient(schema);
    const payment = await this.service.allocate(
      db,
      id,
      schema,
      user.sub,
      body.allocations.map((allocation) => ({
        ...allocation,
        allocatedAmount: moneyFromDto(allocation.allocatedAmount),
      })),
    );
    return paymentWithAllocationsToDto(payment);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<PaymentReceivedDto> {
    const db = this.connections.getClient(schema);
    const payment = await this.service.cancel(db, id);
    this.events.publish('payment_received', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
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
    this.events.publish('payment_received', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
