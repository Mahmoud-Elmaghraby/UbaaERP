import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  generalLedgerReportSchema,
  trialBalanceReportSchema,
  incomeStatementReportSchema,
  balanceSheetReportSchema,
  type GeneralLedgerReportDto,
  type TrialBalanceReportDto,
  type IncomeStatementReportDto,
  type BalanceSheetReportDto,
} from '@erp-platform/contracts';
import type {
  GeneralLedgerReport,
  TrialBalanceReport,
  IncomeStatementReport,
  BalanceSheetReport,
} from '../domain/accounting-report.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
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

/**
 * دفتر الأستاذ / ميزان المراجعة / القوائم المالية (CLAUDE.md §10 — step
 * 5, Accounting, Stage 2b). Every endpoint here is read-only and
 * computed on the fly by AccountingReportsService — none of these back
 * a stored table, so there is no create/update/delete surface, just
 * GET with query filters. See the terminology map in
 * claude/accounting-module-research.md.
 *
 * No PlanFeatureGuard yet — same deliberate, tracked gap as every other
 * module's controllers.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('accounting.manage')
@Controller('accounting-reports')
export class AccountingReportsController {
  constructor(
    private readonly service: AccountingReportsService,
    private readonly connections: TenantConnectionManager,
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
}
