import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createPayrollRunSchema,
  payPayrollSchema,
  payrollRunQuerySchema,
  updatePayrollLineSchema,
  type CreatePayrollRunDto,
  type PayPayrollDto,
  type PayrollRunDto,
  type PayrollRunQueryDto,
  type PayrollRunSummaryDto,
  type UpdatePayrollLineDto,
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
import { AuditChanges, NoAudit } from '../../../shared/audit/audit-changes.interceptor';
import { CheckDocumentDates } from '../../../shared/app-settings/document-date';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { PayrollService } from '../application/payroll.service';

/** Payroll runs. Posting and paying are audited through their outbox events (hr.payroll.*). */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequireFeature(FEATURE_KEYS.HR)
@RequirePermissions(HR.payrollManage)
@AuditChanges('hr', 'payroll')
@Controller('hr/payroll-runs')
export class PayrollController {
  constructor(
    private readonly service: PayrollService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(HR.payrollView, HR.payrollManage, HR.payrollApprove, HR.payrollPay)
  list(@CurrentTenantSchema() schema: string, @Query(new ZodValidationPipe(payrollRunQuerySchema)) query: PayrollRunQueryDto): Promise<PayrollRunSummaryDto[]> {
    return this.service.list(this.connections.getClient(schema), query);
  }

  @Get(':id')
  @RequirePermissions()
  @RequireAnyPermission(HR.payrollView, HR.payrollManage, HR.payrollApprove, HR.payrollPay)
  get(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<PayrollRunDto> {
    return this.service.get(this.connections.getClient(schema), id);
  }

  @Post()
  create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createPayrollRunSchema)) body: CreatePayrollRunDto,
  ): Promise<PayrollRunDto> {
    return this.service.create(this.connections.getClient(schema), body, user.sub);
  }

  @Post(':id/recalculate')
  @NoAudit()
  recalculate(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<PayrollRunDto> {
    return this.service.recalculate(this.connections.getClient(schema), id);
  }

  @Patch(':id/lines/:lineId')
  updateLine(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('lineId', new ParseUUIDPipe()) lineId: string,
    @Body(new ZodValidationPipe(updatePayrollLineSchema)) body: UpdatePayrollLineDto,
  ): Promise<PayrollRunDto> {
    return this.service.updateLine(this.connections.getClient(schema), id, lineId, body);
  }

  @Delete(':id/lines/:lineId')
  removeLine(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('lineId', new ParseUUIDPipe()) lineId: string,
  ): Promise<PayrollRunDto> {
    return this.service.removeLine(this.connections.getClient(schema), id, lineId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.deleteDraft(this.connections.getClient(schema), id);
  }

  @Post(':id/post')
  @NoAudit()
  @RequirePermissions(HR.payrollApprove)
  post(@CurrentTenantSchema() schema: string, @CurrentUser() user: JwtAccessPayload, @Param('id', new ParseUUIDPipe()) id: string): Promise<PayrollRunDto> {
    return this.service.post(this.connections.getClient(schema), id, { schema, userId: user.sub });
  }

  @Post(':id/pay')
  @NoAudit()
  @RequirePermissions(HR.payrollPay)
  @CheckDocumentDates('date')
  pay(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(payPayrollSchema)) body: PayPayrollDto,
  ): Promise<PayrollRunDto> {
    return this.service.pay(this.connections.getClient(schema), id, body, { schema, userId: user.sub });
  }
}
