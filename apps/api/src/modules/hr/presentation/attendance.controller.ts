import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  attendanceImportSchema,
  attendanceQuerySchema,
  rebuildAttendanceSchema,
  saveHrHolidaysSchema,
  saveHrShiftSchema,
  updateAttendanceDaySchema,
  type AttendanceDayDto,
  type AttendanceImportDto,
  type AttendanceImportResultDto,
  type AttendanceQueryDto,
  type AttendanceSummaryRowDto,
  type HrHolidayDto,
  type HrShiftDto,
  type RebuildAttendanceDto,
  type RebuildAttendanceResultDto,
  type SaveHrHolidaysDto,
  type SaveHrShiftDto,
  type UpdateAttendanceDayDto,
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
import { AttendanceSetupService } from '../application/attendance-setup.service';
import { AttendanceService } from '../application/attendance.service';

const VIEW = [HR.attendanceView, HR.attendanceManage] as const;

/** Shifts and public holidays. */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequireFeature(FEATURE_KEYS.HR)
@RequirePermissions(HR.attendanceManage)
@AuditChanges('hr', 'attendance_setup')
@Controller('hr')
export class AttendanceSetupController {
  constructor(
    private readonly service: AttendanceSetupService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get('shifts')
  @RequirePermissions()
  @RequireAnyPermission(...VIEW, HR.employeesManage)
  listShifts(@CurrentTenantSchema() schema: string): Promise<HrShiftDto[]> {
    return this.service.listShifts(this.connections.getClient(schema));
  }

  @Post('shifts')
  createShift(@CurrentTenantSchema() schema: string, @Body(new ZodValidationPipe(saveHrShiftSchema)) body: SaveHrShiftDto): Promise<HrShiftDto> {
    return this.service.saveShift(this.connections.getClient(schema), null, body);
  }

  @Put('shifts/:id')
  updateShift(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(saveHrShiftSchema)) body: SaveHrShiftDto,
  ): Promise<HrShiftDto> {
    return this.service.saveShift(this.connections.getClient(schema), id, body);
  }

  @Delete('shifts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteShift(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.deleteShift(this.connections.getClient(schema), id);
  }

  @Get('holidays')
  @RequirePermissions()
  @RequireAnyPermission(...VIEW)
  listHolidays(@CurrentTenantSchema() schema: string, @Query('year', new ParseIntPipe({ optional: true })) year?: number): Promise<HrHolidayDto[]> {
    return this.service.listHolidays(this.connections.getClient(schema), year);
  }

  @Post('holidays')
  addHolidays(@CurrentTenantSchema() schema: string, @Body(new ZodValidationPipe(saveHrHolidaysSchema)) body: SaveHrHolidaysDto): Promise<HrHolidayDto[]> {
    return this.service.addHolidays(this.connections.getClient(schema), body);
  }

  @Delete('holidays/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteHoliday(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.deleteHoliday(this.connections.getClient(schema), id);
  }
}

/** The attendance sheet: import, rebuild, correct, summarise. Hand corrections are audited per day. */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequireFeature(FEATURE_KEYS.HR)
@RequirePermissions(HR.attendanceManage)
@AuditChanges('hr', 'attendance')
@Controller('hr/attendance')
export class AttendanceController {
  constructor(
    private readonly service: AttendanceService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions()
  @RequireAnyPermission(...VIEW)
  list(@CurrentTenantSchema() schema: string, @Query(new ZodValidationPipe(attendanceQuerySchema)) query: AttendanceQueryDto): Promise<AttendanceDayDto[]> {
    return this.service.list(this.connections.getClient(schema), query);
  }

  @Get('summary')
  @RequirePermissions()
  @RequireAnyPermission(...VIEW)
  summary(
    @CurrentTenantSchema() schema: string,
    @Query(new ZodValidationPipe(attendanceQuerySchema)) query: AttendanceQueryDto,
  ): Promise<AttendanceSummaryRowDto[]> {
    return this.service.summary(this.connections.getClient(schema), query);
  }

  /** Thousands of punch rows: the audit keeps who imported, not the rows (the import table does). */
  @Post('import')
  @NoAudit()
  import(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(attendanceImportSchema)) body: AttendanceImportDto,
  ): Promise<AttendanceImportResultDto> {
    return this.service.import(this.connections.getClient(schema), body, user.sub);
  }

  @Post('rebuild')
  @NoAudit()
  rebuild(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(rebuildAttendanceSchema)) body: RebuildAttendanceDto,
  ): Promise<RebuildAttendanceResultDto> {
    return this.service.rebuild(this.connections.getClient(schema), body);
  }

  @Put('days/:id')
  updateDay(
    @CurrentTenantSchema() schema: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateAttendanceDaySchema)) body: UpdateAttendanceDayDto,
  ): Promise<AttendanceDayDto> {
    return this.service.updateDay(this.connections.getClient(schema), id, body);
  }

  @Post('days/:id/reset')
  resetDay(@CurrentTenantSchema() schema: string, @Param('id', new ParseUUIDPipe()) id: string): Promise<AttendanceDayDto> {
    return this.service.resetDay(this.connections.getClient(schema), id);
  }
}
