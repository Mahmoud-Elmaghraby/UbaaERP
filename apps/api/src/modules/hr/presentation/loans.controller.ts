import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import {
  createLoanSchema,
  createPayAdjustmentsSchema,
  disburseLoanSchema,
  loanDecisionSchema,
  loanQuerySchema,
  payAdjustmentQuerySchema,
  postponeLoanSchema,
  repayLoanSchema,
  type CreateLoanDto,
  type CreatePayAdjustmentsDto,
  type DisburseLoanDto,
  type LoanDecisionDto,
  type LoanDto,
  type LoanQueryDto,
  type LoanSummaryDto,
  type PayAdjustmentDto,
  type PayAdjustmentQueryDto,
  type PostponeLoanDto,
  type RepayLoanDto,
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
import { LoansService } from '../application/loans.service';

/**
 * Employee loans. Paying out and repaying are audited through their own outbox events
 * (hr.loan.disbursed / hr.loan.repaid); the other writes through @AuditChanges.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequireFeature(FEATURE_KEYS.HR)
@RequirePermissions(HR.loansManage)
@AuditChanges('hr', 'loan')
@Controller('hr/loans')
export class LoansController {
  constructor(
    private readonly service: LoansService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(HR.loansView, HR.loansManage, HR.loansApprove)
  list(@CurrentTenantSchema() schema: string, @Query(new ZodValidationPipe(loanQuerySchema)) query: LoanQueryDto): Promise<LoanSummaryDto[]> {
    return this.service.list(this.connections.getClient(schema), query);
  }

  @Get(':id')
  @RequirePermissions()
  @RequireAnyPermission(HR.loansView, HR.loansManage, HR.loansApprove)
  get(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<LoanDto> {
    return this.service.get(this.connections.getClient(schema), id);
  }

  @Post()
  create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createLoanSchema)) body: CreateLoanDto,
  ): Promise<LoanDto> {
    return this.service.create(this.connections.getClient(schema), body, user.sub);
  }

  @Post(':id/approve')
  @RequirePermissions(HR.loansApprove)
  approve(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(loanDecisionSchema)) body: LoanDecisionDto,
  ): Promise<LoanDto> {
    return this.service.approve(this.connections.getClient(schema), id, body, user.sub);
  }

  @Post(':id/reject')
  @RequirePermissions(HR.loansApprove)
  reject(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(loanDecisionSchema)) body: LoanDecisionDto,
  ): Promise<LoanDto> {
    return this.service.reject(this.connections.getClient(schema), id, body, user.sub);
  }

  @Post(':id/cancel')
  @RequirePermissions()
  @RequireAnyPermission(HR.loansManage, HR.loansApprove)
  cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(loanDecisionSchema)) body: LoanDecisionDto,
  ): Promise<LoanDto> {
    return this.service.cancel(this.connections.getClient(schema), id, body, user.sub);
  }

  @Post(':id/disburse')
  @NoAudit()
  @CheckDocumentDates('date')
  disburse(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(disburseLoanSchema)) body: DisburseLoanDto,
  ): Promise<LoanDto> {
    return this.service.disburse(this.connections.getClient(schema), id, body, { schema, userId: user.sub });
  }

  @Post(':id/repay')
  @NoAudit()
  @CheckDocumentDates('date')
  repay(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(repayLoanSchema)) body: RepayLoanDto,
  ): Promise<LoanDto> {
    return this.service.repay(this.connections.getClient(schema), id, body, { schema, userId: user.sub });
  }

  @Post(':id/postpone')
  postpone(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(postponeLoanSchema)) body: PostponeLoanDto,
  ): Promise<LoanDto> {
    return this.service.postpone(this.connections.getClient(schema), id, body);
  }
}

/** Bonuses and penalties — pay items, so they follow the salary permissions. */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequireFeature(FEATURE_KEYS.HR)
@RequirePermissions(HR.salariesManage)
@AuditChanges('hr', 'pay_adjustment')
@Controller('hr/pay-adjustments')
export class PayAdjustmentsController {
  constructor(
    private readonly service: LoansService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(HR.salariesView, HR.salariesManage)
  list(
    @CurrentTenantSchema() schema: string,
    @Query(new ZodValidationPipe(payAdjustmentQuerySchema)) query: PayAdjustmentQueryDto,
  ): Promise<PayAdjustmentDto[]> {
    return this.service.listAdjustments(this.connections.getClient(schema), query);
  }

  @Post()
  create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createPayAdjustmentsSchema)) body: CreatePayAdjustmentsDto,
  ): Promise<{ created: number }> {
    return this.service.createAdjustments(this.connections.getClient(schema), body, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.deleteAdjustment(this.connections.getClient(schema), id);
  }
}
