import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  salesAnalysisQuerySchema,
  saveSalesRepSchema,
  type SalesAnalysisQueryDto,
  type SalesAnalysisReportDto,
  type SalesRepDto,
  type SaveSalesRepDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { SALES_PERMISSIONS as S } from '../../../shared/auth/trade-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { SalesRepsService } from '../application/services/sales-reps.service';
import { SalesAnalysisService } from '../application/services/sales-analysis.service';

/** Sales representatives (المندوبين) and the sales analysis report. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class SalesRepsController {
  constructor(
    private readonly reps: SalesRepsService,
    private readonly analysis: SalesAnalysisService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get('sales-reps')
  @RequireAnyPermission(S.view, S.posUse)
  list(@CurrentTenantSchema() schema: string): Promise<SalesRepDto[]> {
    return this.reps.list(this.connections.getClient(schema));
  }

  @Get('sales-reps/:id')
  @RequireAnyPermission(S.view, S.posUse)
  getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<SalesRepDto> {
    return this.reps.getById(this.connections.getClient(schema), id);
  }

  @Post('sales-reps')
  @RequirePermissions(S.settingsManage)
  create(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(saveSalesRepSchema)) body: SaveSalesRepDto,
  ): Promise<SalesRepDto> {
    return this.reps.save(this.connections.getClient(schema), null, body);
  }

  @Put('sales-reps/:id')
  @RequirePermissions(S.settingsManage)
  update(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveSalesRepSchema)) body: SaveSalesRepDto,
  ): Promise<SalesRepDto> {
    return this.reps.save(this.connections.getClient(schema), id, body);
  }

  @Delete('sales-reps/:id')
  @RequirePermissions(S.settingsManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    await this.reps.delete(this.connections.getClient(schema), id);
  }

  @Get('sales-reports/analysis')
  @RequirePermissions(S.reportsView)
  analysisReport(
    @CurrentTenantSchema() schema: string,
    @Query(new ZodValidationPipe(salesAnalysisQuerySchema)) query: SalesAnalysisQueryDto,
  ): Promise<SalesAnalysisReportDto> {
    return this.analysis.report(this.connections.getClient(schema), query);
  }
}
