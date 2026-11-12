import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import type { HrOverviewDto } from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission } from '../../../shared/auth/require-permissions.decorator';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { HR_PERMISSIONS as HR } from '../../../shared/auth/hr-permissions';
import { HrReportsService } from '../application/hr-reports.service';

/** HR reports. Pay figures are added only for users who may see payroll / loans. */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequireFeature(FEATURE_KEYS.HR)
@Controller('hr/reports')
export class HrReportsController {
  constructor(
    private readonly service: HrReportsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get('overview')
  @RequireAnyPermission(HR.employeesView, HR.employeesManage)
  overview(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ): Promise<HrOverviewDto> {
    return this.service.overview(this.connections.getClient(schema), year ?? new Date().getFullYear(), user.permissions);
  }
}
