import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  customerSchema,
  createCustomerSchema,
  updateCustomerSchema,
  type CustomerDto,
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
import { SalesEventPublisher } from '../infrastructure/events/sales-event-publisher';

/**
 * No PlanFeatureGuard yet — same deliberate, tracked gap shared with
 * every other business module's controllers (see SuppliersController's
 * class comment). Revisit once, for every optional module at once.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sales.manage')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly service: CustomersService,
    private readonly connections: TenantConnectionManager,
    private readonly events: SalesEventPublisher,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<CustomerDto[]> {
    const db = this.connections.getClient(schema);
    const customers = await this.service.list(db);
    return customers.map((c) => customerSchema.parse(c));
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<CustomerDto> {
    const db = this.connections.getClient(schema);
    const customer = await this.service.getById(db, id);
    return customerSchema.parse(customer);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerDto,
  ): Promise<CustomerDto> {
    const db = this.connections.getClient(schema);
    const customer = await this.service.create(db, body);
    this.events.publish('customer', 'created', { schema, entityId: customer.id, actorUserId: user.sub });
    return customerSchema.parse(customer);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerDto,
  ): Promise<CustomerDto> {
    const db = this.connections.getClient(schema);
    const customer = await this.service.update(db, id, body);
    this.events.publish('customer', 'updated', { schema, entityId: customer.id, actorUserId: user.sub });
    return customerSchema.parse(customer);
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
