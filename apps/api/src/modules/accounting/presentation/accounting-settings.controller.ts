import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  accountingSettingsSchema,
  updateAccountingSettingsSchema,
  type AccountingSettingsDto,
  type UpdateAccountingSettingsDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { AccountingSettingsService } from '../application/services/accounting-settings.service';

/**
 * Default-account mapping (CLAUDE.md §10 — step 5, Accounting, Stage
 * 6/7) — GET+PATCH only singleton, same shape as SettingsController.
 * Gated behind PlanFeatureGuard (FEATURE_KEYS.ACCOUNTING) — see
 * ChartOfAccountsController's class comment.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequirePermissions('accounting.manage')
@RequireFeature(FEATURE_KEYS.ACCOUNTING)
@Controller('accounting-settings')
export class AccountingSettingsController {
  constructor(
    private readonly service: AccountingSettingsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async get(@CurrentTenantSchema() schema: string): Promise<AccountingSettingsDto> {
    const db = this.connections.getClient(schema);
    const settings = await this.service.get(db);
    return accountingSettingsSchema.parse(settings);
  }

  @Patch()
  async update(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(updateAccountingSettingsSchema)) body: UpdateAccountingSettingsDto,
  ): Promise<AccountingSettingsDto> {
    const db = this.connections.getClient(schema);
    const updated = await this.service.update(db, body);
    return accountingSettingsSchema.parse(updated);
  }
}
