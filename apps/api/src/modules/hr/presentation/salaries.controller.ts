import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  salaryRegisterQuerySchema,
  saveEmployeeSalarySchema,
  saveSalaryComponentSchema,
  type EmployeeSalaryHistoryDto,
  type SalaryComponentDto,
  type SalaryRegisterDto,
  type SalaryRegisterQueryDto,
  type SaveEmployeeSalaryDto,
  type SaveSalaryComponentDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { HR_PERMISSIONS as HR } from '../../../shared/auth/hr-permissions';
import { AuditChanges } from '../../../shared/audit/audit-changes.interceptor';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { SalaryComponentsService } from '../application/salary-components.service';
import { EmployeeSalariesService } from '../application/employee-salaries.service';

/** Salary components. Salaries are private: every read needs hr.salaries.view or .manage. */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequireFeature(FEATURE_KEYS.HR)
@RequirePermissions(HR.salariesManage)
@AuditChanges('hr', 'salary_component')
@Controller('hr/salary-components')
export class SalaryComponentsController {
  constructor(
    private readonly service: SalaryComponentsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(HR.salariesView, HR.salariesManage)
  list(@CurrentTenantSchema() schema: string): Promise<SalaryComponentDto[]> {
    return this.service.list(this.connections.getClient(schema));
  }

  @Post()
  create(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(saveSalaryComponentSchema)) body: SaveSalaryComponentDto,
  ): Promise<SalaryComponentDto> {
    return this.service.save(this.connections.getClient(schema), null, body);
  }

  @Put(':id')
  update(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(saveSalaryComponentSchema)) body: SaveSalaryComponentDto,
  ): Promise<SalaryComponentDto> {
    return this.service.save(this.connections.getClient(schema), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.delete(this.connections.getClient(schema), id);
  }
}

/** Each employee's salary history, and the salaries register. Writes audited as hr.salary.* per employee. */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequireFeature(FEATURE_KEYS.HR)
@RequirePermissions(HR.salariesManage)
@AuditChanges('hr', 'salary')
@Controller('hr')
export class EmployeeSalariesController {
  constructor(
    private readonly service: EmployeeSalariesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get('salaries/register')
  @RequirePermissions()
  @RequireAnyPermission(HR.salariesView, HR.salariesManage)
  register(
    @CurrentTenantSchema() schema: string,
    @Query(new ZodValidationPipe(salaryRegisterQuerySchema)) query: SalaryRegisterQueryDto,
  ): Promise<SalaryRegisterDto> {
    return this.service.register(this.connections.getClient(schema), query);
  }

  @Get('employees/:id/salaries')
  @RequirePermissions()
  @RequireAnyPermission(HR.salariesView, HR.salariesManage)
  history(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<EmployeeSalaryHistoryDto> {
    return this.service.history(this.connections.getClient(schema), id);
  }

  @Post('employees/:id/salaries')
  create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(saveEmployeeSalarySchema)) body: SaveEmployeeSalaryDto,
  ): Promise<EmployeeSalaryHistoryDto> {
    return this.service.create(this.connections.getClient(schema), id, body, user.sub);
  }

  @Put('employees/:id/salaries/:salaryId')
  update(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('salaryId', new ParseUUIDPipe()) salaryId: string,
    @Body(new ZodValidationPipe(saveEmployeeSalarySchema)) body: SaveEmployeeSalaryDto,
  ): Promise<EmployeeSalaryHistoryDto> {
    return this.service.update(this.connections.getClient(schema), id, salaryId, body);
  }

  @Delete('employees/:id/salaries/:salaryId')
  remove(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('salaryId', new ParseUUIDPipe()) salaryId: string,
  ): Promise<EmployeeSalaryHistoryDto> {
    return this.service.delete(this.connections.getClient(schema), id, salaryId);
  }
}
