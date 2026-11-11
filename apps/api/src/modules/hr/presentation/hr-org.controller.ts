import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import {
  saveHrDepartmentSchema,
  saveHrJobTitleSchema,
  type HrDepartmentDto,
  type HrJobTitleDto,
  type SaveHrDepartmentDto,
  type SaveHrJobTitleDto,
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
import { HrOrgService } from '../application/hr-org.service';

/** Departments. Reading is open to whoever sees employees. */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequireFeature(FEATURE_KEYS.HR)
@RequirePermissions(HR.employeesManage)
@AuditChanges('hr', 'department')
@Controller('hr/departments')
export class HrDepartmentsController {
  constructor(
    private readonly service: HrOrgService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(HR.employeesView, HR.employeesManage)
  list(@CurrentTenantSchema() schema: string): Promise<HrDepartmentDto[]> {
    return this.service.listDepartments(this.connections.getClient(schema));
  }

  @Post()
  create(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(saveHrDepartmentSchema)) body: SaveHrDepartmentDto,
  ): Promise<HrDepartmentDto> {
    return this.service.saveDepartment(this.connections.getClient(schema), null, body);
  }

  @Put(':id')
  update(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(saveHrDepartmentSchema)) body: SaveHrDepartmentDto,
  ): Promise<HrDepartmentDto> {
    return this.service.saveDepartment(this.connections.getClient(schema), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.deleteDepartment(this.connections.getClient(schema), id);
  }
}

/** Job titles. */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequireFeature(FEATURE_KEYS.HR)
@RequirePermissions(HR.employeesManage)
@AuditChanges('hr', 'job_title')
@Controller('hr/job-titles')
export class HrJobTitlesController {
  constructor(
    private readonly service: HrOrgService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(HR.employeesView, HR.employeesManage)
  list(@CurrentTenantSchema() schema: string): Promise<HrJobTitleDto[]> {
    return this.service.listJobTitles(this.connections.getClient(schema));
  }

  @Post()
  create(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(saveHrJobTitleSchema)) body: SaveHrJobTitleDto,
  ): Promise<HrJobTitleDto> {
    return this.service.saveJobTitle(this.connections.getClient(schema), null, body);
  }

  @Put(':id')
  update(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(saveHrJobTitleSchema)) body: SaveHrJobTitleDto,
  ): Promise<HrJobTitleDto> {
    return this.service.saveJobTitle(this.connections.getClient(schema), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.deleteJobTitle(this.connections.getClient(schema), id);
  }
}
