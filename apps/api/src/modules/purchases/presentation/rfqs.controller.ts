import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  rfqSchema,
  rfqWithDetailsSchema,
  createRfqSchema,
  updateRfqSchema,
  type RfqDto,
  type RfqWithDetailsDto,
  type CreateRfqDto,
  type UpdateRfqDto,
} from '@erp-platform/contracts';
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
import { RfqsService } from '../application/services/rfqs.service';
import { PurchasesEventPublisher } from '../infrastructure/events/purchases-event-publisher';

/** Optional document-chain module — gated by PlanFeatureGuard (PURCHASES_RFQ). */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequirePermissions('purchases.manage')
@RequireFeature(FEATURE_KEYS.PURCHASES_RFQ)
@Controller('rfqs')
export class RfqsController {
  constructor(
    private readonly service: RfqsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: PurchasesEventPublisher,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<RfqDto[]> {
    const db = this.connections.getClient(schema);
    const rfqs = await this.service.list(db);
    return rfqs.map((r) => rfqSchema.parse(r));
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<RfqWithDetailsDto> {
    const db = this.connections.getClient(schema);
    const rfq = await this.service.getById(db, id);
    return rfqWithDetailsSchema.parse(rfq);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createRfqSchema)) body: CreateRfqDto,
  ): Promise<RfqWithDetailsDto> {
    const db = this.connections.getClient(schema);
    const rfq = await this.service.create(db, body);
    this.events.publish('rfq', 'created', { schema, entityId: rfq.id, actorUserId: user.sub });
    return rfqWithDetailsSchema.parse(rfq);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRfqSchema)) body: UpdateRfqDto,
  ): Promise<RfqWithDetailsDto> {
    const db = this.connections.getClient(schema);
    const rfq = await this.service.update(db, id, body);
    this.events.publish('rfq', 'updated', { schema, entityId: id, actorUserId: user.sub });
    return rfqWithDetailsSchema.parse(rfq);
  }

  @Post(':id/send')
  async send(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<RfqDto> {
    const db = this.connections.getClient(schema);
    const rfq = await this.service.send(db, id);
    this.events.publish('rfq', 'sent', { schema, entityId: id, actorUserId: user.sub });
    return rfqSchema.parse(rfq);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<RfqDto> {
    const db = this.connections.getClient(schema);
    const rfq = await this.service.cancel(db, id);
    this.events.publish('rfq', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
    return rfqSchema.parse(rfq);
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
    this.events.publish('rfq', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
