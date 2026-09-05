import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  fiscalYearSchema,
  createFiscalYearSchema,
  updateFiscalYearSchema,
  accountingPeriodSchema,
  type FiscalYearDto,
  type CreateFiscalYearDto,
  type UpdateFiscalYearDto,
  type AccountingPeriodDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { FiscalYearsService } from '../application/services/fiscal-years.service';
import { AccountingPeriodsService } from '../application/services/accounting-periods.service';
import { AccountingEventPublisher } from '../infrastructure/events/accounting-event-publisher';

/** No PlanFeatureGuard yet — see ChartOfAccountsController's class comment. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('accounting.manage')
@Controller('fiscal-years')
export class FiscalYearsController {
  constructor(
    private readonly service: FiscalYearsService,
    private readonly periodsService: AccountingPeriodsService,
    private readonly connections: TenantConnectionManager,
    private readonly events: AccountingEventPublisher,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<FiscalYearDto[]> {
    const db = this.connections.getClient(schema);
    const fiscalYears = await this.service.list(db);
    return fiscalYears.map((fy) => fiscalYearSchema.parse(fy));
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<FiscalYearDto> {
    const db = this.connections.getClient(schema);
    const fiscalYear = await this.service.getById(db, id);
    return fiscalYearSchema.parse(fiscalYear);
  }

  @Get(':id/periods')
  async listPeriods(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<AccountingPeriodDto[]> {
    const db = this.connections.getClient(schema);
    const periods = await this.periodsService.list(db, id);
    return periods.map((p) => accountingPeriodSchema.parse(p));
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createFiscalYearSchema)) body: CreateFiscalYearDto,
  ): Promise<FiscalYearDto> {
    const db = this.connections.getClient(schema);
    const fiscalYear = await this.service.create(db, body);
    this.events.publish('fiscal_year', 'created', { schema, entityId: fiscalYear.id, actorUserId: user.sub });
    return fiscalYearSchema.parse(fiscalYear);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateFiscalYearSchema)) body: UpdateFiscalYearDto,
  ): Promise<FiscalYearDto> {
    const db = this.connections.getClient(schema);
    const fiscalYear = await this.service.update(db, id, body);
    this.events.publish('fiscal_year', 'updated', { schema, entityId: fiscalYear.id, actorUserId: user.sub });
    return fiscalYearSchema.parse(fiscalYear);
  }

  @Post(':id/close')
  async close(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<FiscalYearDto> {
    const db = this.connections.getClient(schema);
    const fiscalYear = await this.service.close(db, id);
    this.events.publish('fiscal_year', 'closed', { schema, entityId: fiscalYear.id, actorUserId: user.sub });
    return fiscalYearSchema.parse(fiscalYear);
  }

  @Post(':id/reopen')
  async reopen(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<FiscalYearDto> {
    const db = this.connections.getClient(schema);
    const fiscalYear = await this.service.reopen(db, id);
    this.events.publish('fiscal_year', 'reopened', { schema, entityId: fiscalYear.id, actorUserId: user.sub });
    return fiscalYearSchema.parse(fiscalYear);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id);
    this.events.publish('fiscal_year', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }
}
