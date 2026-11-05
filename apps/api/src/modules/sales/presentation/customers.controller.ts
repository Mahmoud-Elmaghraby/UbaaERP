import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  customerSchema,
  customerCreditCheckSchema,
  createCustomerSchema,
  updateCustomerSchema,
  type CustomerDto,
  type CustomerCreditCheckDto,
  type CreateCustomerDto,
  type UpdateCustomerDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { CustomersService } from '../application/services/customers.service';
import { SalesRegisterService } from '../application/services/sales-register.service';
import type { CustomerAccountSummaryDto } from '@erp-platform/contracts';
import { SalesEventPublisher } from '../infrastructure/events/sales-event-publisher';
import { CustomerCreditService } from '../application/services/customer-credit.service';
import type { Customer, CreateCustomerInput } from '../domain/customer.entity';

function toDto(customer: Customer): CustomerDto {
  const { creditLimitMinor, ...rest } = customer;
  return customerSchema.parse({ ...rest, creditLimitMinorUnits: creditLimitMinor === null ? null : creditLimitMinor.toString() });
}

function toInput<T extends { creditLimitMinorUnits?: string | null }>(body: T): Omit<T, 'creditLimitMinorUnits'> & { creditLimitMinor?: bigint | null } {
  const { creditLimitMinorUnits, ...rest } = body;
  if (creditLimitMinorUnits === undefined) return rest;
  return { ...rest, creditLimitMinor: creditLimitMinorUnits === null ? null : BigInt(creditLimitMinorUnits) };
}

/**
 * No PlanFeatureGuard: intentionally excluded — Customers is master data
 * every Sales plan needs, not one of the 3 optional document-chain steps
 * PlanFeatureGuard gates (Quotations, Sales Orders, Deliveries — see
 * feature-catalog.ts and SuppliersController's class comment for the
 * same reasoning on the Purchases side).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sales.manage')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly service: CustomersService,
    private readonly connections: TenantConnectionManager,
    private readonly events: SalesEventPublisher,
    private readonly register: SalesRegisterService,
    private readonly credit: CustomerCreditService,
  ) {}

  /**
   * Credit limit status before confirming an order / posting an invoice of
   * `amountMinorUnits` (in `currency`, default the customer's). The same rule
   * the confirm / post endpoints enforce (migration 0109).
   */
  @Get(':id/credit-check')
  async creditCheck(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Query('amountMinorUnits') amountMinorUnits?: string,
    @Query('currency') currency?: string,
  ): Promise<CustomerCreditCheckDto> {
    if (amountMinorUnits !== undefined && !/^\d+$/.test(amountMinorUnits)) {
      throw new BadRequestException('amountMinorUnits must be a non-negative integer.');
    }
    const db = this.connections.getClient(schema);
    const canOverride = user.permissions.includes('sales.override_credit_limit');
    const customer = await this.service.getById(db, id);
    const amount = { minor: BigInt(amountMinorUnits ?? '0'), currency: currency?.toUpperCase() || customer.defaultCurrency };
    const result = await this.credit.check(db, id, amount, canOverride);
    return customerCreditCheckSchema.parse({
      mode: result.exempt ? 'off' : result.mode,
      currency: result.currency,
      limitMinorUnits: result.limitMinor === null ? null : result.limitMinor.toString(),
      balanceMinorUnits: result.balanceMinor.toString(),
      exposureMinorUnits: result.exposureMinor.toString(),
      exceeded: result.exceeded,
      canOverride,
    });
  }

  /** Balance, overdue, aging and recent activity — the head of the customer page. */
  @Get(':id/account-summary')
  accountSummary(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<CustomerAccountSummaryDto> {
    return this.register.customerSummary(this.connections.getClient(schema), id);
  }

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<CustomerDto[]> {
    const db = this.connections.getClient(schema);
    const customers = await this.service.list(db);
    return customers.map(toDto);
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<CustomerDto> {
    const db = this.connections.getClient(schema);
    const customer = await this.service.getById(db, id);
    return toDto(customer);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerDto,
  ): Promise<CustomerDto> {
    const db = this.connections.getClient(schema);
    const customer = await this.service.create(db, toInput(body) as CreateCustomerInput);
    this.events.publish('customer', 'created', { schema, entityId: customer.id, actorUserId: user.sub });
    return toDto(customer);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerDto,
  ): Promise<CustomerDto> {
    const db = this.connections.getClient(schema);
    const customer = await this.service.update(db, id, toInput(body));
    this.events.publish('customer', 'updated', { schema, entityId: customer.id, actorUserId: user.sub });
    return toDto(customer);
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
    this.events.publish('customer', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
