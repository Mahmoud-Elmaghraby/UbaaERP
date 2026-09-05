import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  supplierSchema,
  createSupplierSchema,
  updateSupplierSchema,
  type SupplierDto,
  type CreateSupplierDto,
  type UpdateSupplierDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { SuppliersService } from '../application/services/suppliers.service';
import { PurchasesEventPublisher } from '../infrastructure/events/purchases-event-publisher';

/**
 * No PlanFeatureGuard yet — same deliberate, tracked gap as Inventory's
 * controllers (see UnitsOfMeasureController's class comment): no
 * plans/features model exists in the public schema yet. Revisit once,
 * for every optional module at once, rather than inventing a one-off
 * model here.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('purchases.manage')
@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly service: SuppliersService,
    private readonly connections: TenantConnectionManager,
    private readonly events: PurchasesEventPublisher,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<SupplierDto[]> {
    const db = this.connections.getClient(schema);
    const suppliers = await this.service.list(db);
    return suppliers.map((s) => supplierSchema.parse(s));
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<SupplierDto> {
    const db = this.connections.getClient(schema);
    const supplier = await this.service.getById(db, id);
    return supplierSchema.parse(supplier);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createSupplierSchema)) body: CreateSupplierDto,
  ): Promise<SupplierDto> {
    const db = this.connections.getClient(schema);
    const supplier = await this.service.create(db, body);
    this.events.publish('supplier', 'created', { schema, entityId: supplier.id, actorUserId: user.sub });
    return supplierSchema.parse(supplier);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupplierSchema)) body: UpdateSupplierDto,
  ): Promise<SupplierDto> {
    const db = this.connections.getClient(schema);
    const supplier = await this.service.update(db, id, body);
    this.events.publish('supplier', 'updated', { schema, entityId: supplier.id, actorUserId: user.sub });
    return supplierSchema.parse(supplier);
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
    this.events.publish('supplier', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
