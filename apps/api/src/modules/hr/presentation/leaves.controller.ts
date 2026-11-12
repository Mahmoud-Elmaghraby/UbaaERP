import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  carryOverLeaveSchema,
  createLeaveRequestSchema,
  decideLeaveRequestSchema,
  leaveBalanceQuerySchema,
  leaveRequestQuerySchema,
  saveLeaveBalanceSchema,
  saveLeaveTypeSchema,
  type CarryOverLeaveDto,
  type CreateLeaveRequestDto,
  type DecideLeaveRequestDto,
  type LeaveBalanceDto,
  type LeaveBalanceQueryDto,
  type LeavePreviewDto,
  type LeaveRequestDto,
  type LeaveRequestQueryDto,
  type LeaveTypeDto,
  type SaveLeaveBalanceDto,
  type SaveLeaveTypeDto,
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
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { LeavesService } from '../application/leaves.service';

const VIEW = [HR.leavesView, HR.leavesManage, HR.leavesApprove] as const;

/** Leave types, requests and balances. Every decision lands in the audit log as hr.leave.*. */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequireFeature(FEATURE_KEYS.HR)
@RequirePermissions(HR.leavesManage)
@AuditChanges('hr', 'leave')
@Controller('hr')
export class LeavesController {
  constructor(
    private readonly service: LeavesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get('leave-types')
  @RequirePermissions()
  @RequireAnyPermission(...VIEW)
  listTypes(@CurrentTenantSchema() schema: string): Promise<LeaveTypeDto[]> {
    return this.service.listTypes(this.connections.getClient(schema));
  }

  @Post('leave-types')
  createType(@CurrentTenantSchema() schema: string, @Body(new ZodValidationPipe(saveLeaveTypeSchema)) body: SaveLeaveTypeDto): Promise<LeaveTypeDto> {
    return this.service.saveType(this.connections.getClient(schema), null, body);
  }

  @Put('leave-types/:id')
  updateType(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(saveLeaveTypeSchema)) body: SaveLeaveTypeDto,
  ): Promise<LeaveTypeDto> {
    return this.service.saveType(this.connections.getClient(schema), id, body);
  }

  @Delete('leave-types/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteType(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.deleteType(this.connections.getClient(schema), id);
  }

  @Get('leave-requests')
  @RequirePermissions()
  @RequireAnyPermission(...VIEW)
  listRequests(
    @CurrentTenantSchema() schema: string,
    @Query(new ZodValidationPipe(leaveRequestQuerySchema)) query: LeaveRequestQueryDto,
  ): Promise<LeaveRequestDto[]> {
    return this.service.listRequests(this.connections.getClient(schema), query);
  }

  /** Days a request would take and the balance left — nothing is saved. */
  @Post('leave-requests/preview')
  @NoAudit()
  preview(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(createLeaveRequestSchema)) body: CreateLeaveRequestDto,
  ): Promise<LeavePreviewDto> {
    return this.service.preview(this.connections.getClient(schema), body);
  }

  @Post('leave-requests')
  createRequest(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createLeaveRequestSchema)) body: CreateLeaveRequestDto,
  ): Promise<LeaveRequestDto> {
    return this.service.createRequest(this.connections.getClient(schema), body, user.sub);
  }

  @Post('leave-requests/:id/approve')
  @RequirePermissions(HR.leavesApprove)
  approve(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(decideLeaveRequestSchema)) body: DecideLeaveRequestDto,
  ): Promise<LeaveRequestDto> {
    return this.service.approve(this.connections.getClient(schema), id, body, user.sub);
  }

  @Post('leave-requests/:id/reject')
  @RequirePermissions(HR.leavesApprove)
  reject(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(decideLeaveRequestSchema)) body: DecideLeaveRequestDto,
  ): Promise<LeaveRequestDto> {
    return this.service.reject(this.connections.getClient(schema), id, body, user.sub);
  }

  @Post('leave-requests/:id/cancel')
  @RequirePermissions()
  @RequireAnyPermission(HR.leavesManage, HR.leavesApprove)
  cancel(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(decideLeaveRequestSchema)) body: DecideLeaveRequestDto,
  ): Promise<LeaveRequestDto> {
    return this.service.cancel(this.connections.getClient(schema), id, body, user.sub);
  }

  @Get('leave-balances')
  @RequirePermissions()
  @RequireAnyPermission(...VIEW)
  balances(
    @CurrentTenantSchema() schema: string,
    @Query(new ZodValidationPipe(leaveBalanceQuerySchema)) query: LeaveBalanceQueryDto,
  ): Promise<LeaveBalanceDto[]> {
    return this.service.balances(this.connections.getClient(schema), query);
  }

  @Put('leave-balances')
  saveBalance(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(saveLeaveBalanceSchema)) body: SaveLeaveBalanceDto,
  ): Promise<LeaveBalanceDto> {
    return this.service.saveBalance(this.connections.getClient(schema), body);
  }

  @Post('leave-balances/carry-over')
  carryOver(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(carryOverLeaveSchema)) body: CarryOverLeaveDto,
  ): Promise<{ updated: number }> {
    return this.service.carryOverYear(this.connections.getClient(schema), body);
  }
}
