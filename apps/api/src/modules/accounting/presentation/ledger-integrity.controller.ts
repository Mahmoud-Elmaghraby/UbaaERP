import { Controller, Get, UseGuards } from '@nestjs/common';
import type { LedgerIntegrityReportDto } from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { LedgerIntegrityService } from '../application/services/ledger-integrity.service';

/** فحص سلامة البيانات — the books against every sub-ledger, as of now. Company-wide (branch-limited users are refused). */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequirePermissions('accounting.manage')
@RequireFeature(FEATURE_KEYS.ACCOUNTING)
@Controller('ledger-integrity')
export class LedgerIntegrityController {
  constructor(
    private readonly service: LedgerIntegrityService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  report(@CurrentTenantSchema() schema: string): Promise<LedgerIntegrityReportDto> {
    return this.service.report(this.connections.getClient(schema));
  }
}
