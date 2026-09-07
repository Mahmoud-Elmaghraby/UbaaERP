import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  chartOfAccountSchema,
  createChartOfAccountSchema,
  updateChartOfAccountSchema,
  type ChartOfAccountDto,
  type CreateChartOfAccountDto,
  type UpdateChartOfAccountDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { ChartOfAccountsService } from '../application/services/chart-of-accounts.service';
import { AccountingEventPublisher } from '../infrastructure/events/accounting-event-publisher';

/**
 * Gated behind PlanFeatureGuard (FEATURE_KEYS.ACCOUNTING) — closes the
 * long-flagged gap this comment used to describe (see
 * docs/claude-context/accounting-module-status.md): a tenant's plan is
 * now enforced here, at the API layer, not just hidden in the frontend
 * nav (CLAUDE.md §2.8). Every other Accounting controller carries the
 * same guard/decorator pair.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequirePermissions('accounting.manage')
@RequireFeature(FEATURE_KEYS.ACCOUNTING)
@Controller('chart-of-accounts')
export class ChartOfAccountsController {
  constructor(
    private readonly service: ChartOfAccountsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: AccountingEventPublisher,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('accountType') accountType?: string,
    @Query('isActive') isActive?: string,
  ): Promise<ChartOfAccountDto[]> {
    const db = this.connections.getClient(schema);
    const accounts = await this.service.list(db, {
      accountType: accountType as ChartOfAccountDto['accountType'] | undefined,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
    return accounts.map((a) => chartOfAccountSchema.parse(a));
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<ChartOfAccountDto> {
    const db = this.connections.getClient(schema);
    const account = await this.service.getById(db, id);
    return chartOfAccountSchema.parse(account);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createChartOfAccountSchema)) body: CreateChartOfAccountDto,
  ): Promise<ChartOfAccountDto> {
    const db = this.connections.getClient(schema);
    const account = await this.service.create(db, body);
    this.events.publish('chart_of_account', 'created', { schema, entityId: account.id, actorUserId: user.sub });
    return chartOfAccountSchema.parse(account);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateChartOfAccountSchema)) body: UpdateChartOfAccountDto,
  ): Promise<ChartOfAccountDto> {
    const db = this.connections.getClient(schema);
    const account = await this.service.update(db, id, body);
    this.events.publish('chart_of_account', 'updated', { schema, entityId: account.id, actorUserId: user.sub });
    return chartOfAccountSchema.parse(account);
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
    this.events.publish('chart_of_account', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
