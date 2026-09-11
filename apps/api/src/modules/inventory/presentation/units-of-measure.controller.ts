import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  unitOfMeasureSchema,
  createUnitOfMeasureSchema,
  updateUnitOfMeasureSchema,
  convertUnitOfMeasureSchema,
  unitConversionResultSchema,
  type UnitOfMeasureDto,
  type CreateUnitOfMeasureDto,
  type UpdateUnitOfMeasureDto,
  type ConvertUnitOfMeasureDto,
  type UnitConversionResultDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { UnitsOfMeasureService } from '../application/services/units-of-measure.service';
import { InventoryEventPublisher } from '../infrastructure/events/inventory-event-publisher';

/**
 * No PlanFeatureGuard: intentionally excluded. The Plan/PlanFeature model
 * now exists (see feature-catalog.ts) and PlanFeatureGuard is wired onto
 * Accounting plus the 7 Sales/Purchases optional document-chain
 * controllers — but Inventory itself is core infrastructure every plan
 * needs (Sales and Purchases both depend on it), not a standalone
 * optional module, so it was never in scope for gating. This replaces an
 * earlier (2026-08-28) comment that called this an open gap before the
 * Plan model existed; it isn't one.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('inventory.manage')
@Controller('units-of-measure')
export class UnitsOfMeasureController {
  constructor(
    private readonly service: UnitsOfMeasureService,
    private readonly connections: TenantConnectionManager,
    private readonly events: InventoryEventPublisher,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<UnitOfMeasureDto[]> {
    const db = this.connections.getClient(schema);
    const units = await this.service.list(db);
    return units.map((u) => unitOfMeasureSchema.parse(u));
  }

  @Get('convert')
  async convert(
    @CurrentTenantSchema() schema: string,
    @Query(new ZodValidationPipe(convertUnitOfMeasureSchema)) query: ConvertUnitOfMeasureDto,
  ): Promise<UnitConversionResultDto> {
    const db = this.connections.getClient(schema);
    const quantity = await this.service.convert(db, query.fromUnitId, query.toUnitId, query.quantity);
    return unitConversionResultSchema.parse({ quantity });
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<UnitOfMeasureDto> {
    const db = this.connections.getClient(schema);
    const unit = await this.service.getById(db, id);
    return unitOfMeasureSchema.parse(unit);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createUnitOfMeasureSchema)) body: CreateUnitOfMeasureDto,
  ): Promise<UnitOfMeasureDto> {
    const db = this.connections.getClient(schema);
    const unit = await this.service.create(db, body);
    this.events.publish('unit_of_measure', 'created', { schema, entityId: unit.id, actorUserId: user.sub });
    return unitOfMeasureSchema.parse(unit);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUnitOfMeasureSchema)) body: UpdateUnitOfMeasureDto,
  ): Promise<UnitOfMeasureDto> {
    const db = this.connections.getClient(schema);
    const unit = await this.service.update(db, id, body);
    this.events.publish('unit_of_measure', 'updated', { schema, entityId: unit.id, actorUserId: user.sub });
    return unitOfMeasureSchema.parse(unit);
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
    this.events.publish('unit_of_measure', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
