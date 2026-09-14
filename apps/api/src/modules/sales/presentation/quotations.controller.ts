import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  quotationSchema,
  quotationWithLinesSchema,
  createQuotationSchema,
  updateQuotationSchema,
  type QuotationDto,
  type QuotationWithLinesDto,
  type CreateQuotationDto,
  type UpdateQuotationDto,
} from '@erp-platform/contracts';
import type { Quotation, QuotationWithLines } from '../domain/quotation.entity';
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
import { QuotationsService } from '../application/services/quotations.service';
import { SalesEventPublisher } from '../infrastructure/events/sales-event-publisher';
import { moneyFromDto, moneyToDto } from './money.mapper';

function quotationToDto(quotation: Quotation): QuotationDto {
  return quotationSchema.parse(quotation);
}

function quotationWithLinesToDto(quotation: QuotationWithLines): QuotationWithLinesDto {
  return quotationWithLinesSchema.parse({
    ...quotation,
    lines: quotation.lines.map((line) => ({ ...line, unitPrice: moneyToDto(line.unitPrice) })),
    totalAmount: moneyToDto(quotation.totalAmount),
  });
}

/** Optional document-chain module — gated by PlanFeatureGuard (SALES_QUOTATIONS). */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequirePermissions('sales.manage')
@RequireFeature(FEATURE_KEYS.SALES_QUOTATIONS)
@Controller('quotations')
export class QuotationsController {
  constructor(
    private readonly service: QuotationsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: SalesEventPublisher,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<QuotationDto[]> {
    const db = this.connections.getClient(schema);
    const quotations = await this.service.list(db);
    return quotations.map(quotationToDto);
  }

  @Get(':id')
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<QuotationWithLinesDto> {
    const db = this.connections.getClient(schema);
    const quotation = await this.service.getById(db, id);
    return quotationWithLinesToDto(quotation);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createQuotationSchema)) body: CreateQuotationDto,
  ): Promise<QuotationWithLinesDto> {
    const db = this.connections.getClient(schema);
    const quotation = await this.service.create(
      db,
      {
        ...body,
        lines: body.lines.map((line) => ({ ...line, unitPrice: moneyFromDto(line.unitPrice) })),
      },
      schema,
    );
    this.events.publish('quotation', 'created', { schema, entityId: quotation.id, actorUserId: user.sub });
    return quotationWithLinesToDto(quotation);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateQuotationSchema)) body: UpdateQuotationDto,
  ): Promise<QuotationWithLinesDto> {
    const db = this.connections.getClient(schema);
    const quotation = await this.service.update(
      db,
      id,
      {
        ...body,
        lines: body.lines?.map((line) => ({ ...line, unitPrice: moneyFromDto(line.unitPrice) })),
      },
      schema,
    );
    this.events.publish('quotation', 'updated', { schema, entityId: id, actorUserId: user.sub });
    return quotationWithLinesToDto(quotation);
  }

  @Post(':id/send')
  async send(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<QuotationDto> {
    const db = this.connections.getClient(schema);
    const quotation = await this.service.send(db, id);
    this.events.publish('quotation', 'sent', { schema, entityId: id, actorUserId: user.sub });
    return quotationToDto(quotation);
  }

  @Post(':id/accept')
  async accept(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<QuotationDto> {
    const db = this.connections.getClient(schema);
    const quotation = await this.service.accept(db, id);
    this.events.publish('quotation', 'accepted', { schema, entityId: id, actorUserId: user.sub });
    return quotationToDto(quotation);
  }

  @Post(':id/reject')
  async reject(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<QuotationDto> {
    const db = this.connections.getClient(schema);
    const quotation = await this.service.reject(db, id);
    this.events.publish('quotation', 'rejected', { schema, entityId: id, actorUserId: user.sub });
    return quotationToDto(quotation);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<QuotationDto> {
    const db = this.connections.getClient(schema);
    const quotation = await this.service.cancel(db, id);
    this.events.publish('quotation', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
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
    this.events.publish('quotation', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
