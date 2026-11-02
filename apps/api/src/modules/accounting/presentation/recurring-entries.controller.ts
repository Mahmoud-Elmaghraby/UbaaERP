import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { saveRecurringEntrySchema, type RecurringEntryDto, type SaveRecurringEntryDto } from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { RecurringEntriesService } from '../application/services/recurring-entries.service';

/** القيود المتكررة. */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequirePermissions('accounting.manage')
@RequireFeature(FEATURE_KEYS.ACCOUNTING)
@Controller('recurring-entries')
export class RecurringEntriesController {
  constructor(
    private readonly service: RecurringEntriesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  list(@CurrentTenantSchema() schema: string): Promise<RecurringEntryDto[]> {
    return this.service.list(this.connections.getClient(schema));
  }

  @Post()
  create(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(saveRecurringEntrySchema)) body: SaveRecurringEntryDto,
  ): Promise<RecurringEntryDto> {
    return this.service.save(this.connections.getClient(schema), null, body);
  }

  /** Makes every entry that is due today (the scheduler does the same every hour). */
  @Post('generate')
  async generate(@CurrentTenantSchema() schema: string): Promise<{ made: number }> {
    return { made: await this.service.generateDue(this.connections.getClient(schema)) };
  }

  @Patch(':id')
  update(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveRecurringEntrySchema)) body: SaveRecurringEntryDto,
  ): Promise<RecurringEntryDto> {
    return this.service.save(this.connections.getClient(schema), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    await this.service.delete(this.connections.getClient(schema), id);
  }
}
