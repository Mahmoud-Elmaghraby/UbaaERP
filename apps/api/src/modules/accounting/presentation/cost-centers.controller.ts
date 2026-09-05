import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  costCenterSchema,
  createCostCenterSchema,
  updateCostCenterSchema,
  type CostCenterDto,
  type CreateCostCenterDto,
  type UpdateCostCenterDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { CostCentersService } from '../application/services/cost-centers.service';
import { AccountingEventPublisher } from '../infrastructure/events/accounting-event-publisher';

/**
 * Cost Centers (CLAUDE.md §10 — step 5, Accounting, Stage 4) — plain
 * CRUD, same shape as ChartOfAccountsController minus the tree-specific
 * pieces. No PlanFeatureGuard yet, same deliberate, tracked gap as
 * every other module's controllers.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('accounting.manage')
@Controller('cost-centers')
export class CostCentersController {
  constructor(
    private readonly service: CostCentersService,
    private readonly connections: TenantConnectionManager,
    private readonly events: AccountingEventPublisher,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('isActive') isActive?: string,
  ): Promise<CostCenterDto[]> {
    const db = this.connections.getClient(schema);
    const costCenters = await this.service.list(db, {
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
    return costCenters.map((c) => costCenterSchema.parse(c));
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<CostCenterDto> {
    const db = this.connections.getClient(schema);
    const costCenter = await this.service.getById(db, id);
    return costCenterSchema.parse(costCenter);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createCostCenterSchema)) body: CreateCostCenterDto,
  ): Promise<CostCenterDto> {
    const db = this.connections.getClient(schema);
    const costCenter = await this.service.create(db, body);
    this.events.publish('cost_center', 'created', { schema, entityId: costCenter.id, actorUserId: user.sub });
    return costCenterSchema.parse(costCenter);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCostCenterSchema)) body: UpdateCostCenterDto,
  ): Promise<CostCenterDto> {
    const db = this.connections.getClient(schema);
    const costCenter = await this.service.update(db, id, body);
    this.events.publish('cost_center', 'updated', { schema, entityId: costCenter.id, actorUserId: user.sub });
    return costCenterSchema.parse(costCenter);
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
    this.events.publish('cost_center', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
