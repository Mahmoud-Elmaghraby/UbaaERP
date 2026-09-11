import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  purchaseRequisitionSchema,
  purchaseRequisitionWithLinesSchema,
  createPurchaseRequisitionSchema,
  updatePurchaseRequisitionSchema,
  type PurchaseRequisitionDto,
  type PurchaseRequisitionWithLinesDto,
  type CreatePurchaseRequisitionDto,
  type UpdatePurchaseRequisitionDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { PurchaseRequisitionsService } from '../application/services/purchase-requisitions.service';
import { PurchasesEventPublisher } from '../infrastructure/events/purchases-event-publisher';

/**
 * No PlanFeatureGuard: intentionally excluded — a requisition is an
 * internal pre-RFQ request, not one of the optional document-chain steps
 * PlanFeatureGuard gates (see feature-catalog.ts and SuppliersController's
 * class comment for the same reasoning).
 *
 * Status changes (submit/approve/reject/cancel) are gated by the same
 * 'purchases.manage' permission as everything else here — NOT wired to
 * Users & Permissions' approval_chains (who a requisition's actual
 * approver should be). See PurchaseRequisitionsService's class comment
 * for why that deeper enforcement is deliberately deferred, not silently
 * skipped.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('purchases.manage')
@Controller('purchase-requisitions')
export class PurchaseRequisitionsController {
  constructor(
    private readonly service: PurchaseRequisitionsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: PurchasesEventPublisher,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<PurchaseRequisitionDto[]> {
    const db = this.connections.getClient(schema);
    const requisitions = await this.service.list(db);
    return requisitions.map((r) => purchaseRequisitionSchema.parse(r));
  }

  @Get(':id')
  async getById(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<PurchaseRequisitionWithLinesDto> {
    const db = this.connections.getClient(schema);
    const requisition = await this.service.getById(db, id);
    return purchaseRequisitionWithLinesSchema.parse(requisition);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createPurchaseRequisitionSchema)) body: CreatePurchaseRequisitionDto,
  ): Promise<PurchaseRequisitionWithLinesDto> {
    const db = this.connections.getClient(schema);
    const requisition = await this.service.create(db, user.sub, body);
    this.events.publish('purchase_requisition', 'created', {
      schema,
      entityId: requisition.id,
      actorUserId: user.sub,
    });
    return purchaseRequisitionWithLinesSchema.parse(requisition);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePurchaseRequisitionSchema)) body: UpdatePurchaseRequisitionDto,
  ): Promise<PurchaseRequisitionWithLinesDto> {
    const db = this.connections.getClient(schema);
    const requisition = await this.service.update(db, id, body);
    this.events.publish('purchase_requisition', 'updated', { schema, entityId: id, actorUserId: user.sub });
    return purchaseRequisitionWithLinesSchema.parse(requisition);
  }

  @Post(':id/submit')
  async submit(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<PurchaseRequisitionDto> {
    const db = this.connections.getClient(schema);
    const requisition = await this.service.submit(db, id);
    this.events.publish('purchase_requisition', 'submitted', { schema, entityId: id, actorUserId: user.sub });
    return purchaseRequisitionSchema.parse(requisition);
  }

  @Post(':id/approve')
  async approve(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<PurchaseRequisitionDto> {
    const db = this.connections.getClient(schema);
    const requisition = await this.service.approve(db, id);
    this.events.publish('purchase_requisition', 'approved', { schema, entityId: id, actorUserId: user.sub });
    return purchaseRequisitionSchema.parse(requisition);
  }

  @Post(':id/reject')
  async reject(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<PurchaseRequisitionDto> {
    const db = this.connections.getClient(schema);
    const requisition = await this.service.reject(db, id);
    this.events.publish('purchase_requisition', 'rejected', { schema, entityId: id, actorUserId: user.sub });
    return purchaseRequisitionSchema.parse(requisition);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<PurchaseRequisitionDto> {
    const db = this.connections.getClient(schema);
    const requisition = await this.service.cancel(db, id);
    this.events.publish('purchase_requisition', 'cancelled', { schema, entityId: id, actorUserId: user.sub });
    return purchaseRequisitionSchema.parse(requisition);
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
    this.events.publish('purchase_requisition', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
