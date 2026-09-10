import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  supplierQuotationSchema,
  supplierQuotationWithLinesSchema,
  createSupplierQuotationSchema,
  updateSupplierQuotationSchema,
  type SupplierQuotationDto,
  type SupplierQuotationWithLinesDto,
  type CreateSupplierQuotationDto,
  type UpdateSupplierQuotationDto,
} from '@erp-platform/contracts';
import type { SupplierQuotation, SupplierQuotationWithLines } from '../domain/supplier-quotation.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { SupplierQuotationsService } from '../application/services/supplier-quotations.service';
import { PurchasesEventPublisher } from '../infrastructure/events/purchases-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';

function quotationToDto(quotation: SupplierQuotation): SupplierQuotationDto {
  return supplierQuotationSchema.parse(quotation);
}

function quotationWithLinesToDto(quotation: SupplierQuotationWithLines): SupplierQuotationWithLinesDto {
  return supplierQuotationWithLinesSchema.parse({
    ...quotation,
    lines: quotation.lines.map((line) => ({ ...line, unitPrice: moneyToDto(line.unitPrice) })),
  });
}

/** Optional document-chain module — gated by PlanFeatureGuard (PURCHASES_SUPPLIER_QUOTATIONS). */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequirePermissions('purchases.manage')
@RequireFeature(FEATURE_KEYS.PURCHASES_SUPPLIER_QUOTATIONS)
@Controller('supplier-quotations')
export class SupplierQuotationsController {
  constructor(
    private readonly service: SupplierQuotationsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: PurchasesEventPublisher,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('rfqId') rfqId?: string,
  ): Promise<SupplierQuotationDto[]> {
    const db = this.connections.getClient(schema);
    const quotations = await this.service.list(db, rfqId);
    return quotations.map(quotationToDto);
  }

  @Get(':id')
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<SupplierQuotationWithLinesDto> {
    const db = this.connections.getClient(schema);
    const quotation = await this.service.getById(db, id);
    return quotationWithLinesToDto(quotation);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createSupplierQuotationSchema)) body: CreateSupplierQuotationDto,
  ): Promise<SupplierQuotationWithLinesDto> {
    const db = this.connections.getClient(schema);
    const quotation = await this.service.create(db, {
      ...body,
      lines: body.lines.map((line) => ({ ...line, unitPrice: moneyFromDto(line.unitPrice) })),
    });
    this.events.publish('supplier_quotation', 'created', { schema, entityId: quotation.id, actorUserId: user.sub });
    return quotationWithLinesToDto(quotation);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupplierQuotationSchema)) body: UpdateSupplierQuotationDto,
  ): Promise<SupplierQuotationWithLinesDto> {
    const db = this.connections.getClient(schema);
    const quotation = await this.service.update(db, id, {
      ...body,
      lines: body.lines?.map((line) => ({ ...line, unitPrice: moneyFromDto(line.unitPrice) })),
    });
    this.events.publish('supplier_quotation', 'updated', { schema, entityId: id, actorUserId: user.sub });
    return quotationWithLinesToDto(quotation);
  }

  @Post(':id/select')
  async select(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<SupplierQuotationDto> {
    const db = this.connections.getClient(schema);
    const quotation = await this.service.select(db, id);
    this.events.publish('supplier_quotation', 'selected', { schema, entityId: id, actorUserId: user.sub });
    return quotationToDto(quotation);
  }

  @Post(':id/reject')
  async reject(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<SupplierQuotationDto> {
    const db = this.connections.getClient(schema);
    const quotation = await this.service.reject(db, id);
    this.events.publish('supplier_quotation', 'rejected', { schema, entityId: id, actorUserId: user.sub });
    return quotationToDto(quotation);
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
    this.events.publish('supplier_quotation', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
