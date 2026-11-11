import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  changeEmployeeStatusSchema,
  employeeListQuerySchema,
  saveEmployeeSchema,
  type ChangeEmployeeStatusDto,
  type EmployeeDto,
  type EmployeeListQueryDto,
  type EmployeeSummaryDto,
  type SaveEmployeeDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { HR_PERMISSIONS as HR } from '../../../shared/auth/hr-permissions';
import { AuditChanges } from '../../../shared/audit/audit-changes.interceptor';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { EmployeesService } from '../application/employees.service';

/** The employee file. Every write lands in the audit log as hr.employee.<action>. */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequireFeature(FEATURE_KEYS.HR)
@RequirePermissions(HR.employeesManage)
@AuditChanges('hr', 'employee')
@Controller('hr/employees')
export class EmployeesController {
  constructor(
    private readonly service: EmployeesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(HR.employeesView, HR.employeesManage)
  list(
    @CurrentTenantSchema() schema: string,
    @Query(new ZodValidationPipe(employeeListQuerySchema)) query: EmployeeListQueryDto,
  ): Promise<EmployeeSummaryDto[]> {
    return this.service.list(this.connections.getClient(schema), query);
  }

  @Get(':id')
  @RequirePermissions()
  @RequireAnyPermission(HR.employeesView, HR.employeesManage)
  get(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<EmployeeDto> {
    return this.service.getById(this.connections.getClient(schema), id);
  }

  @Post()
  create(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(saveEmployeeSchema)) body: SaveEmployeeDto,
  ): Promise<EmployeeDto> {
    return this.service.create(this.connections.getClient(schema), body);
  }

  @Put(':id')
  update(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(saveEmployeeSchema)) body: SaveEmployeeDto,
  ): Promise<EmployeeDto> {
    return this.service.update(this.connections.getClient(schema), id, body);
  }

  /** Suspend, reactivate or end service. */
  @Patch(':id/status')
  changeStatus(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(changeEmployeeStatusSchema)) body: ChangeEmployeeStatusDto,
  ): Promise<EmployeeDto> {
    return this.service.changeStatus(this.connections.getClient(schema), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.delete(this.connections.getClient(schema), id);
  }
}
