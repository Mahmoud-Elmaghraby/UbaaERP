import { readTaxReport } from '../../../../shared/taxes/tax-report-reader';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { CHART_OF_ACCOUNT_REPOSITORY, type ChartOfAccountRepository } from '../ports/chart-of-account.repository';
import {
  JOURNAL_ENTRY_LINE_REPOSITORY,
  type JournalEntryLineRepository,
  type AccountMoneyTotals,
} from '../ports/journal-entry-line.repository';
import { ACCOUNTING_PERIOD_REPOSITORY, type AccountingPeriodRepository } from '../ports/accounting-period.repository';
import { FISCAL_YEAR_REPOSITORY, type FiscalYearRepository } from '../ports/fiscal-year.repository';
import { ACCOUNTING_SETTINGS_REPOSITORY, type AccountingSettingsRepository } from '../ports/accounting-settings.repository';
import { BANK_ACCOUNT_REPOSITORY, type BankAccountRepository } from '../ports/bank-account.repository';
import type { ChartOfAccount } from '../../domain/chart-of-account.entity';
import type {
  GeneralLedgerReport,
  GeneralLedgerLine,
  TrialBalanceReport,
  TrialBalanceRow,
  IncomeStatementReport,
  IncomeStatementRow,
  BalanceSheetReport,
  CashFlowReport,
  CashFlowRow,
} from '../../domain/accounting-report.entity';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import { categoryCanonicalSide } from './account-balance-sign';

/**
 * Read-only reports (CLAUDE.md §10 — step 5, Accounting, Stage 2/2b).
 * None of these back a stored table — every one is computed here from
 * journal_entry_lines + chart_of_accounts, filtered to status='posted'
 * only (a draft or cancelled entry never affects a balance). See the
 * terminology map in claude/accounting-module-research.md for how these
 * map to دفتر الأستاذ / ميزان المراجعة / القوائم المالية.
 *
 * Every amount is signed using categoryCanonicalSide(accountType), not
 * each account's own normalBalance — see that helper's own comment for
 * why (contra accounts must net correctly into their category's total).
 *
 * Repositories from other Accounting entities (chart of accounts, fiscal
 * years, accounting periods) are injected directly here rather than
 * through their own services — same "direct repository read across
 * entities in the same module" pattern already used by e.g.
 * GoodsReceiptsService reading PurchaseOrderRepository in Purchases —
 * this service only ever reads their data, never their business rules.
 */
@Injectable()
export class AccountingReportsService {
  constructor(
    @Inject(CHART_OF_ACCOUNT_REPOSITORY) private readonly accounts: ChartOfAccountRepository,
    @Inject(JOURNAL_ENTRY_LINE_REPOSITORY) private readonly journalEntryLines: JournalEntryLineRepository,
    @Inject(ACCOUNTING_PERIOD_REPOSITORY) private readonly accountingPeriods: AccountingPeriodRepository,
    @Inject(FISCAL_YEAR_REPOSITORY) private readonly fiscalYears: FiscalYearRepository,
    @Inject(ACCOUNTING_SETTINGS_REPOSITORY) private readonly accountingSettings: AccountingSettingsRepository,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly bankAccounts: BankAccountRepository,
    private readonly tenantSettings: TenantSettingsService,
  ) {}

  private moneyFromTotals(totals: AccountMoneyTotals, currency: string): { debit: Money; credit: Money } {
    return {
      debit: Money.fromMinorUnits(BigInt(totals.totalDebitMinorUnits), currency),
      credit: Money.fromMinorUnits(BigInt(totals.totalCreditMinorUnits), currency),
    };
  }

  private buildAmountRows(
    accounts: ChartOfAccount[],
    sums: Record<string, AccountMoneyTotals>,
    currency: string,
  ): { rows: { accountId: string; accountCode: string; accountName: string; amount: Money }[]; total: Money } {
    let total = Money.zero(currency);
    const rows: { accountId: string; accountCode: string; accountName: string; amount: Money }[] = [];
    for (const account of accounts) {
      const totals = sums[account.id];
      if (!totals) continue;
      const { debit, credit } = this.moneyFromTotals(totals, currency);
      const side = categoryCanonicalSide(account.accountType);
      const amount = side === 'debit' ? debit.subtract(credit) : credit.subtract(debit);
      rows.push({ accountId: account.id, accountCode: account.code, accountName: account.name, amount });
      total = total.add(amount);
    }
    rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    return { rows, total };
  }

  /** دفتر الأستاذ — every posted line touching one account, with a running balance. */
  async generalLedger(
    db: Kysely<TenantDatabase>,
    accountId: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<GeneralLedgerReport> {
    const account = await this.accounts.findById(db, accountId);
    if (!account) throw entityNotFound('CHART_OF_ACCOUNT', accountId);

    const currency = (await this.tenantSettings.get(db)).currencyCode;
    const side = categoryCanonicalSide(account.accountType);

    const openingTotals = fromDate
      ? await this.journalEntryLines.sumPostedByAccountBefore(db, accountId, fromDate)
      : { totalDebitMinorUnits: '0', totalCreditMinorUnits: '0' };
    const { debit: openingDebit, credit: openingCredit } = this.moneyFromTotals(openingTotals, currency);
    let running = side === 'debit' ? openingDebit.subtract(openingCredit) : openingCredit.subtract(openingDebit);
    const openingBalance = running;

    const rawLines = await this.journalEntryLines.listPostedByAccount(db, accountId, fromDate, toDate);
    const lines: GeneralLedgerLine[] = rawLines.map((raw) => {
      const debit = Money.fromMinorUnits(BigInt(raw.debitAmountMinorUnits), currency);
      const credit = Money.fromMinorUnits(BigInt(raw.creditAmountMinorUnits), currency);
      running = side === 'debit' ? running.add(debit).subtract(credit) : running.add(credit).subtract(debit);
      return {
        journalEntryId: raw.journalEntryId,
        entryNumber: raw.entryNumber,
        entryDate: raw.entryDate,
        description: raw.description,
        debitAmount: debit,
        creditAmount: credit,
        runningBalance: running,
      };
    });

    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      fromDate: fromDate ?? null,
      toDate: toDate ?? null,
      openingBalance,
      lines,
      closingBalance: running,
    };
  }

  /** ميزان المراجعة — every leaf account with posted activity up to asOfDate. */
  async trialBalance(db: Kysely<TenantDatabase>, asOfDate: string): Promise<TrialBalanceReport> {
    const currency = (await this.tenantSettings.get(db)).currencyCode;
    const leafAccounts = (await this.accounts.list(db)).filter((a) => !a.isGroup);
    const sums = await this.journalEntryLines.sumPostedByAccounts(
      db,
      leafAccounts.map((a) => a.id),
      undefined,
      asOfDate,
    );

    const rows: TrialBalanceRow[] = [];
    let totalDebit = Money.zero(currency);
    let totalCredit = Money.zero(currency);

    for (const account of leafAccounts) {
      const totals = sums[account.id];
      if (!totals) continue; // no posted activity — omitted, matching typical trial-balance practice
      const { debit, credit } = this.moneyFromTotals(totals, currency);
      const side = categoryCanonicalSide(account.accountType);
      const balance = side === 'debit' ? debit.subtract(credit) : credit.subtract(debit);
      rows.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.accountType,
        totalDebit: debit,
        totalCredit: credit,
        balance,
      });
      totalDebit = totalDebit.add(debit);
      totalCredit = totalCredit.add(credit);
    }
    rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    return { asOfDate, currency, rows, totalDebit, totalCredit, isBalanced: totalDebit.equals(totalCredit) };
  }

  /** قائمة الدخل — revenue/expense accounts, net of contra accounts, over a date range. */
  async incomeStatement(db: Kysely<TenantDatabase>, fromDate: string, toDate: string): Promise<IncomeStatementReport> {
    const currency = (await this.tenantSettings.get(db)).currencyCode;
    const allAccounts = await this.accounts.list(db);
    const revenueAccounts = allAccounts.filter((a) => !a.isGroup && a.accountType === 'revenue');
    const expenseAccounts = allAccounts.filter((a) => !a.isGroup && a.accountType === 'expense');
    const sums = await this.journalEntryLines.sumPostedByAccounts(
      db,
      [...revenueAccounts, ...expenseAccounts].map((a) => a.id),
      fromDate,
      toDate,
    );

    const revenue = this.buildAmountRows(revenueAccounts, sums, currency);
    const expense = this.buildAmountRows(expenseAccounts, sums, currency);
    const revenueRows: IncomeStatementRow[] = revenue.rows;
    const expenseRows: IncomeStatementRow[] = expense.rows;

    return {
      fromDate,
      toDate,
      currency,
      revenueRows,
      totalRevenue: revenue.total,
      expenseRows,
      totalExpense: expense.total,
      netIncome: revenue.total.subtract(expense.total),
    };
  }

  /**
   * الميزانية العمومية — asset/liability/equity balances as of a date,
   * plus a currentYearEarnings memo line (see BalanceSheetReport's own
   * doc comment: computed the same way the income statement computes
   * it, NOT a posted closing entry — no year-end closing process exists
   * yet).
   */
  async balanceSheet(db: Kysely<TenantDatabase>, asOfDate: string): Promise<BalanceSheetReport> {
    const currency = (await this.tenantSettings.get(db)).currencyCode;
    const allAccounts = await this.accounts.list(db);
    const assetAccounts = allAccounts.filter((a) => !a.isGroup && a.accountType === 'asset');
    const liabilityAccounts = allAccounts.filter((a) => !a.isGroup && a.accountType === 'liability');
    const equityAccounts = allAccounts.filter((a) => !a.isGroup && a.accountType === 'equity');
    const sums = await this.journalEntryLines.sumPostedByAccounts(
      db,
      [...assetAccounts, ...liabilityAccounts, ...equityAccounts].map((a) => a.id),
      undefined,
      asOfDate,
    );

    const assets = this.buildAmountRows(assetAccounts, sums, currency);
    const liabilities = this.buildAmountRows(liabilityAccounts, sums, currency);
    const equity = this.buildAmountRows(equityAccounts, sums, currency);

    let currentYearEarnings = Money.zero(currency);
    const period = await this.accountingPeriods.findByDate(db, asOfDate);
    if (period) {
      const fiscalYear = await this.fiscalYears.findById(db, period.fiscalYearId);
      if (fiscalYear) {
        const incomeStatement = await this.incomeStatement(db, fiscalYear.startDate, asOfDate);
        currentYearEarnings = incomeStatement.netIncome;
      }
    }

    const totalEquity = equity.total.add(currentYearEarnings);

    return {
      asOfDate,
      currency,
      assetRows: assets.rows,
      totalAssets: assets.total,
      liabilityRows: liabilities.rows,
      totalLiabilities: liabilities.total,
      equityRows: equity.rows,
      currentYearEarnings,
      totalEquity,
      isBalanced: assets.total.equals(liabilities.total.add(totalEquity)),
    };
  }

  /**
   * قائمة التدفقات النقدية — indirect method, "operating activities" only.
   * See CashFlowReport's own doc comment for why this is one section, not
   * three: this platform has no operating/investing/financing
   * classification on chart_of_accounts, and adding one is a real new
   * domain concept, not a quick report — deliberately out of scope here.
   *
   * "Cash and cash equivalents" is taken from data that already exists,
   * rather than a new "is this a cash account" flag: AccountingSettings'
   * own designated cashAccountId (Stage 6, used for POS Cash Over/Short)
   * plus every active BankAccount's linked GL account (Stage 5) — exactly
   * the accounts a tenant has told this platform represent cash on hand
   * or in a bank.
   *
   * Every non-cash asset/liability/equity account's balance MOVEMENT
   * during the period (not its cumulative balance) is its own cash
   * adjustment line: an increase in a non-cash asset consumes cash
   * (negated), while an increase in a liability or equity balance is a
   * source of cash (kept as-is) — the standard indirect-method sign
   * flip, applied per categoryCanonicalSide(). netIncome plus every
   * adjustment should reconcile exactly to the change in cash balances
   * over the same period; isConsistent checks that independently
   * computed opening/closing cash agree, the same "compute two ways and
   * assert" discipline as TrialBalanceReport.isBalanced.
   */
  async cashFlowStatement(db: Kysely<TenantDatabase>, fromDate: string, toDate: string): Promise<CashFlowReport> {
    const currency = (await this.tenantSettings.get(db)).currencyCode;

    const settings = await this.accountingSettings.getOrCreate(db);
    const activeBankAccounts = await this.bankAccounts.list(db, { isActive: true });
    const cashAccountIds = Array.from(
      new Set(
        [settings.cashAccountId, ...activeBankAccounts.map((b) => b.chartOfAccountId)].filter(
          (id): id is string => id !== null,
        ),
      ),
    );

    const netIncome = (await this.incomeStatement(db, fromDate, toDate)).netIncome;

    const allAccounts = await this.accounts.list(db);
    const nonCashAccounts = allAccounts.filter(
      (a) =>
        !a.isGroup &&
        (a.accountType === 'asset' || a.accountType === 'liability' || a.accountType === 'equity') &&
        !cashAccountIds.includes(a.id),
    );
    const periodSums = await this.journalEntryLines.sumPostedByAccounts(
      db,
      nonCashAccounts.map((a) => a.id),
      fromDate,
      toDate,
    );

    const adjustments: CashFlowRow[] = [];
    let netCashFromOperations = netIncome;
    for (const account of nonCashAccounts) {
      const totals = periodSums[account.id];
      if (!totals) continue;
      const { debit, credit } = this.moneyFromTotals(totals, currency);
      const side = categoryCanonicalSide(account.accountType);
      const change = side === 'debit' ? debit.subtract(credit) : credit.subtract(debit);
      if (change.isZero()) continue;
      // Asset increase -> use of cash (flip sign). Liability/equity
      // increase -> source of cash (keep as-is).
      const cashEffect = account.accountType === 'asset' ? Money.zero(currency).subtract(change) : change;
      adjustments.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        changeAmount: cashEffect,
      });
      netCashFromOperations = netCashFromOperations.add(cashEffect);
    }
    adjustments.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    let openingCash = Money.zero(currency);
    for (const id of cashAccountIds) {
      const totals = await this.journalEntryLines.sumPostedByAccountBefore(db, id, fromDate);
      const { debit, credit } = this.moneyFromTotals(totals, currency);
      openingCash = openingCash.add(debit.subtract(credit));
    }

    let closingCash = Money.zero(currency);
    if (cashAccountIds.length > 0) {
      const closingSums = await this.journalEntryLines.sumPostedByAccounts(db, cashAccountIds, undefined, toDate);
      for (const id of cashAccountIds) {
        const totals = closingSums[id];
        if (!totals) continue;
        const { debit, credit } = this.moneyFromTotals(totals, currency);
        closingCash = closingCash.add(debit.subtract(credit));
      }
    }

    return {
      fromDate,
      toDate,
      currency,
      netIncome,
      adjustments,
      netCashFromOperations,
      openingCash,
      closingCash,
      isConsistent: netCashFromOperations.equals(closingCash.subtract(openingCash)),
    };
  }

  /**
   * VAT return for a period, built from the stored tax snapshot of every
   * posted invoice and issued credit note (shared/taxes/tax-report-reader).
   * Amounts are in the documents' currency; the totals count the tenant
   * currency only (foreign-currency rows are listed separately).
   */
  async vatReturn(db: Kysely<TenantDatabase>, from: string, to: string, tenantCurrency: string) {
    const rows = await readTaxReport(db, { from, to });
    const sum = (direction: 'output' | 'input', kind: 'vat' | 'table' | 'withholding') =>
      rows
        .filter((row) => row.direction === direction && row.kind === kind && row.currency === tenantCurrency)
        .reduce((total, row) => total + BigInt(row.amountMinorUnits), 0n);
    const outputVat = sum('output', 'vat');
    const inputVat = sum('input', 'vat');
    return {
      from,
      to,
      currency: tenantCurrency,
      rows,
      outputVatMinorUnits: outputVat.toString(),
      inputVatMinorUnits: inputVat.toString(),
      netVatPayableMinorUnits: (outputVat - inputVat).toString(),
      tableTaxMinorUnits: sum('output', 'table').toString(),
      withholdingByCustomersMinorUnits: sum('output', 'withholding').toString(),
      withholdingFromSuppliersMinorUnits: sum('input', 'withholding').toString(),
    };
  }
}
