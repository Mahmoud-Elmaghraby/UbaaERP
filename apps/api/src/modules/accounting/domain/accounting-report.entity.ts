import type { Money } from '@erp-platform/shared-kernel';
import type { AccountType } from './chart-of-account.entity';

/**
 * Report shapes (CLAUDE.md §10 — step 5, Accounting, Stage 2/2b). None
 * of these are persisted — every one is computed on read by
 * AccountingReportsService from journal_entry_lines + chart_of_accounts.
 * See the terminology map in claude/accounting-module-research.md.
 */

export interface GeneralLedgerLine {
  journalEntryId: string;
  entryNumber: string;
  entryDate: string;
  description: string | null;
  debitAmount: Money;
  creditAmount: Money;
  /** Signed per the account's own normalBalance — running total after this line. */
  runningBalance: Money;
}

export interface GeneralLedgerReport {
  accountId: string;
  accountCode: string;
  accountName: string;
  fromDate: string | null;
  toDate: string | null;
  openingBalance: Money;
  lines: GeneralLedgerLine[];
  closingBalance: Money;
}

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  totalDebit: Money;
  totalCredit: Money;
  balance: Money;
}

export interface TrialBalanceReport {
  asOfDate: string;
  currency: string;
  rows: TrialBalanceRow[];
  totalDebit: Money;
  totalCredit: Money;
  isBalanced: boolean;
}

export interface IncomeStatementRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: Money;
}

export interface IncomeStatementReport {
  fromDate: string;
  toDate: string;
  currency: string;
  revenueRows: IncomeStatementRow[];
  totalRevenue: Money;
  expenseRows: IncomeStatementRow[];
  totalExpense: Money;
  netIncome: Money;
}

export interface BalanceSheetRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: Money;
}

export interface BalanceSheetReport {
  asOfDate: string;
  currency: string;
  assetRows: BalanceSheetRow[];
  totalAssets: Money;
  liabilityRows: BalanceSheetRow[];
  totalLiabilities: Money;
  equityRows: BalanceSheetRow[];
  /** Memo line, not a posted closing entry — see AccountingReportsService.balanceSheet(). */
  currentYearEarnings: Money;
  totalEquity: Money;
  isBalanced: boolean;
}
