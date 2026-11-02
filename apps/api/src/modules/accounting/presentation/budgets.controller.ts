import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { saveBudgetSchema, type BudgetDto, type BudgetVsActualDto, type SaveBudgetDto } from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { BudgetsService } from '../application/services/budgets.service';

/** الموازنات التقديرية. */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequirePermissions('accounting.manage')
@RequireFeature(FEATURE_KEYS.ACCOUNTING)
@Controller('budgets')
export class BudgetsController {
  constructor(
    private readonly service: BudgetsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  list(@CurrentTenantSchema() schema: string): Promise<Omit<BudgetDto, 'lines'>[]> {
    return this.service.list(this.connections.getClient(schema));
  }

  @Get(':id')
  get(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<BudgetDto> {
    return this.service.get(this.connections.getClient(schema), id);
  }

  @Get(':id/vs-actual')
  vsActual(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Query('toDate') toDate?: string,
  ): Promise<BudgetVsActualDto> {
    return this.service.vsActual(this.connections.getClient(schema), id, toDate || undefined);
  }

  @Post()
  create(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(saveBudgetSchema)) body: SaveBudgetDto,
  ): Promise<BudgetDto> {
    return this.service.save(this.connections.getClient(schema), null, body);
  }

  @Patch(':id')
  update(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveBudgetSchema)) body: SaveBudgetDto,
  ): Promise<BudgetDto> {
    return this.service.save(this.connections.getClient(schema), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    await this.service.delete(this.connections.getClient(schema), id);
  }
}
