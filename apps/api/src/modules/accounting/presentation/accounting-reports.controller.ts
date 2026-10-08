import { vatReturnSchema, type VatReturnDto } from '@erp-platform/contracts';
import { TenantSettingsService } from '../../settings/application/services/tenant-settings.service';
import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  generalLedgerReportSchema,
  trialBalanceReportSchema,
  incomeStatementReportSchema,
  balanceSheetReportSchema,
  cashFlowReportSchema,
  type GeneralLedgerReportDto,
  type TrialBalanceReportDto,
  type IncomeStatementReportDto,
  type BalanceSheetReportDto,
  type CashFlowReportDto,
} from '@erp-platform/contracts';
import type {
  GeneralLedgerReport,
  TrialBalanceReport,
  IncomeStatementReport,
  BalanceSheetReport,
  CashFlowReport,
} from '../domain/accounting-report.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { AccountingReportsService } from '../application/services/accounting-reports.service';
import { moneyToDto } from './money.mapper';

function generalLedgerToDto(report: GeneralLedgerReport): GeneralLedgerReportDto {
  return generalLedgerReportSchema.parse({
    ...report,
    openingBalance: moneyToDto(report.openingBalance),
    closingBalance: moneyToDto(report.closingBalance),
    lines: report.lines.map((line) => ({
      ...line,
      debitAmount: moneyToDto(line.debitAmount),
      creditAmount: moneyToDto(line.creditAmount),
      runningBalance: moneyToDto(line.runningBalance),
    })),
  });
}

function trialBalanceToDto(report: TrialBalanceReport): TrialBalanceReportDto {
  return trialBalanceReportSchema.parse({
    ...report,
    totalDebit: moneyToDto(report.totalDebit),
    totalCredit: moneyToDto(report.totalCredit),
    rows: report.rows.map((row) => ({
      ...row,
      totalDebit: moneyToDto(row.totalDebit),
      totalCredit: moneyToDto(row.totalCredit),
      balance: moneyToDto(row.balance),
    })),
  });
}

function incomeStatementToDto(report: IncomeStatementReport): IncomeStatementReportDto {
  return incomeStatementReportSchema.parse({
    ...report,
    totalRevenue: moneyToDto(report.totalRevenue),
    totalExpense: moneyToDto(report.totalExpense),
    netIncome: moneyToDto(report.netIncome),
    revenueRows: report.revenueRows.map((row) => ({ ...row, amount: moneyToDto(row.amount) })),
    expenseRows: report.expenseRows.map((row) => ({ ...row, amount: moneyToDto(row.amount) })),
  });
}

function balanceSheetToDto(report: BalanceSheetReport): BalanceSheetReportDto {
  return balanceSheetReportSchema.parse({
    ...report,
    totalAssets: moneyToDto(report.totalAssets),
    totalLiabilities: moneyToDto(report.totalLiabilities),
    currentYearEarnings: moneyToDto(report.currentYearEarnings),
    totalEquity: moneyToDto(report.totalEquity),
    assetRows: report.assetRows.map((row) => ({ ...row, amount: moneyToDto(row.amount) })),
    liabilityRows: report.liabilityRows.map((row) => ({ ...row, amount: moneyToDto(row.amount) })),
    equityRows: report.equityRows.map((row) => ({ ...row, amount: moneyToDto(row.amount) })),
  });
}

function cashFlowToDto(report: CashFlowReport): CashFlowReportDto {
  return cashFlowReportSchema.parse({
    ...report,
    netIncome: moneyToDto(report.netIncome),
    netCashFromOperations: moneyToDto(report.netCashFromOperations),
    openingCash: moneyToDto(report.openingCash),
    closingCash: moneyToDto(report.closingCash),
    adjustments: report.adjustments.map((row) => ({ ...row, changeAmount: moneyToDto(row.changeAmount) })),
  });
}

/**
 * دفتر الأستاذ / ميزان المراجعة / القوائم المالية (CLAUDE.md §10 — step
 * 5, Accounting, Stage 2b). Every endpoint here is read-only and
 * computed on the fly by AccountingReportsService — none of these back
 * a stored table, so there is no create/update/delete surface, just
 * GET with query filters. See the terminology map in
 * claude/accounting-module-research.md.
 *
 * Gated behind PlanFeatureGuard (FEATURE_KEYS.ACCOUNTING) — see
 * ChartOfAccountsController's class comment.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequirePermissions('accounting.manage')
@RequireFeature(FEATURE_KEYS.ACCOUNTING)
@Controller('accounting-reports')
export class AccountingReportsController {
  constructor(
    private readonly service: AccountingReportsService,
    private readonly connections: TenantConnectionManager,
    private readonly tenantSettings: TenantSettingsService,
  ) {}

  @Get('general-ledger')
  async generalLedger(
    @CurrentTenantSchema() schema: string,
    @Query('accountId') accountId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ): Promise<GeneralLedgerReportDto> {
    if (!accountId) {
      throw new BadRequestException('Query parameter "accountId" is required.');
    }
    const db = this.connections.getClient(schema);
    const report = await this.service.generalLedger(db, accountId, fromDate, toDate);
    return generalLedgerToDto(report);
  }

  /** إقرار ضريبة القيمة المضافة — output vs input VAT for a period (YYYY-MM-DD, inclusive). */
  @Get('vat-return')
  async vatReturn(
    @CurrentTenantSchema() schema: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ): Promise<VatReturnDto> {
    const isDay = (value: string | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!isDay(fromDate) || !isDay(toDate)) {
      throw new BadRequestException('Query parameters "fromDate" and "toDate" (YYYY-MM-DD) are required.');
    }
    const db = this.connections.getClient(schema);
    const tenantCurrency = (await this.tenantSettings.get(db)).currencyCode;
    return vatReturnSchema.parse(await this.service.vatReturn(db, fromDate, toDate, tenantCurrency));
  }

  @Get('trial-balance')
  async trialBalance(
    @CurrentTenantSchema() schema: string,
    @Query('asOfDate') asOfDate?: string,
  ): Promise<TrialBalanceReportDto> {
    if (!asOfDate) {
      throw new BadRequestException('Query parameter "asOfDate" is required.');
    }
    const db = this.connections.getClient(schema);
    const report = await this.service.trialBalance(db, asOfDate);
    return trialBalanceToDto(report);
  }

  @Get('income-statement')
  async incomeStatement(
    @CurrentTenantSchema() schema: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ): Promise<IncomeStatementReportDto> {
    if (!fromDate || !toDate) {
      throw new BadRequestException('Query parameters "fromDate" and "toDate" are required.');
    }
    const db = this.connections.getClient(schema);
    const report = await this.service.incomeStatement(db, fromDate, toDate);
    return incomeStatementToDto(report);
  }

  @Get('balance-sheet')
  async balanceSheet(
    @CurrentTenantSchema() schema: string,
    @Query('asOfDate') asOfDate?: string,
  ): Promise<BalanceSheetReportDto> {
    if (!asOfDate) {
      throw new BadRequestException('Query parameter "asOfDate" is required.');
    }
    const db = this.connections.getClient(schema);
    const report = await this.service.balanceSheet(db, asOfDate);
    return balanceSheetToDto(report);
  }

  @Get('cash-flow-statement')
  async cashFlowStatement(
    @CurrentTenantSchema() schema: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ): Promise<CashFlowReportDto> {
    if (!fromDate || !toDate) {
      throw new BadRequestException('Query parameters "fromDate" and "toDate" are required.');
    }
    const db = this.connections.getClient(schema);
    const report = await this.service.cashFlowStatement(db, fromDate, toDate);
    return cashFlowToDto(report);
  }
}
