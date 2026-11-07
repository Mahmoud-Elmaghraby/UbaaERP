import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  purchaseAnalysisQuerySchema,
  purchasePriceHistoryQuerySchema,
  type PurchaseAnalysisQueryDto,
  type PurchaseAnalysisReportDto,
  type PurchasePriceHistoryDto,
  type PurchasePriceHistoryQueryDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { PurchaseAnalysisService } from '../application/services/purchase-analysis.service';

/** Purchase analysis and an item's purchase price history. Read-only; core Purchases (no PlanFeatureGuard). */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('purchases.manage')
@Controller('purchase-reports')
export class PurchaseReportsController {
  constructor(
    private readonly analysis: PurchaseAnalysisService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get('analysis')
  report(
    @CurrentTenantSchema() schema: string,
    @Query(new ZodValidationPipe(purchaseAnalysisQuerySchema)) query: PurchaseAnalysisQueryDto,
  ): Promise<PurchaseAnalysisReportDto> {
    return this.analysis.report(this.connections.getClient(schema), query);
  }

  @Get('price-history')
  priceHistory(
    @CurrentTenantSchema() schema: string,
    @Query(new ZodValidationPipe(purchasePriceHistoryQuerySchema)) query: PurchasePriceHistoryQueryDto,
  ): Promise<PurchasePriceHistoryDto> {
    return this.analysis.priceHistory(this.connections.getClient(schema), query);
  }
}
