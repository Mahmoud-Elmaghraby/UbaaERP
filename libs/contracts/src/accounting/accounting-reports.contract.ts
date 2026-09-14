import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

/**
 * Report DTOs (CLAUDE.md §10 — step 5, Accounting, Stage 2). None of
 * these back a stored table — every one is computed on read from
 * journal_entry_lines + chart_of_accounts. See the terminology map in
 * claude/accounting-module-research.md for how these map to the
 * traditional دفتر الأستاذ / ميزان المراجعة / قوائم مالية names.
 */

// --- دفتر الأستاذ (General Ledger) ---
export const generalLedgerLineSchema = z.object({
  journalEntryId: z.string().uuid(),
  entryNumber: z.string(),
  entryDate: isoDate,
  description: z.string().nullable(),
  debitAmount: moneySchema,
  creditAmount: moneySchema,
  /** Signed per the account's own normalBalance — a running total after this line. */
  runningBalance: moneySchema,
});
export type GeneralLedgerLineDto = z.infer<typeof generalLedgerLineSchema>;

export const generalLedgerReportSchema = z.object({
  accountId: z.string().uuid(),
  accountCode: z.string(),
  accountName: z.string(),
  fromDate: isoDate.nullable(),
  toDate: isoDate.nullable(),
  openingBalance: moneySchema,
  lines: z.array(generalLedgerLineSchema),
  closingBalance: moneySchema,
});
export type GeneralLedgerReportDto = z.infer<typeof generalLedgerReportSchema>;

// --- ميزان المراجعة (Trial Balance) ---
export const trialBalanceRowSchema = z.object({
  accountId: z.string().uuid(),
  accountCode: z.string(),
  accountName: z.string(),
  accountType: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  totalDebit: moneySchema,
  totalCredit: moneySchema,
  /** Signed per the account's own normalBalance. */
  balance: moneySchema,
});
export type TrialBalanceRowDto = z.infer<typeof trialBalanceRowSchema>;

export const trialBalanceReportSchema = z.object({
  asOfDate: isoDate,
  currency: z.string(),
  rows: z.array(trialBalanceRowSchema),
  totalDebit: moneySchema,
  totalCredit: moneySchema,
  /** True when totalDebit === totalCredit — should always be true if every posted entry balanced. */
  isBalanced: z.boolean(),
});
export type TrialBalanceReportDto = z.infer<typeof trialBalanceReportSchema>;

// --- قائمة الدخل (Income Statement) ---
export const incomeStatementRowSchema = z.object({
  accountId: z.string().uuid(),
  accountCode: z.string(),
  accountName: z.string(),
  amount: moneySchema,
});
export type IncomeStatementRowDto = z.infer<typeof incomeStatementRowSchema>;

export const incomeStatementReportSchema = z.object({
  fromDate: isoDate,
  toDate: isoDate,
  currency: z.string(),
  revenueRows: z.array(incomeStatementRowSchema),
  totalRevenue: moneySchema,
  expenseRows: z.array(incomeStatementRowSchema),
  totalExpense: moneySchema,
  netIncome: moneySchema,
});
export type IncomeStatementReportDto = z.infer<typeof incomeStatementReportSchema>;

// --- الميزانية العمومية (Balance Sheet) ---
export const balanceSheetRowSchema = z.object({
  accountId: z.string().uuid(),
  accountCode: z.string(),
  accountName: z.string(),
  amount: moneySchema,
});
export type BalanceSheetRowDto = z.infer<typeof balanceSheetRowSchema>;

export const balanceSheetReportSchema = z.object({
  asOfDate: isoDate,
  currency: z.string(),
  assetRows: z.array(balanceSheetRowSchema),
  totalAssets: moneySchema,
  liabilityRows: z.array(balanceSheetRowSchema),
  totalLiabilities: moneySchema,
  equityRows: z.array(balanceSheetRowSchema),
  /**
   * Net income for the period from the fiscal year containing asOfDate
   * up to asOfDate, computed the same way the income statement computes
   * it — NOT posted to the equity account 34 (أرباح العام الحالي) as a
   * real closing entry (that's a separate year-end-closing process, not
   * built in this stage, see claude/accounting-module-status.md). Added
   * here as a memo line so the balance sheet still balances
   * (assets = liabilities + equity) before closing entries exist.
   */
  currentYearEarnings: moneySchema,
  totalEquity: moneySchema,
  /** True when totalAssets === totalLiabilities + totalEquity. */
  isBalanced: z.boolean(),
});
export type BalanceSheetReportDto = z.infer<typeof balanceSheetReportSchema>;

// --- قائمة التدفقات النقدية (Cash Flow Statement, indirect method) ---
export const cashFlowRowSchema = z.object({
  accountId: z.string().uuid(),
  accountCode: z.string(),
  accountName: z.string(),
  /** Already the account's cash EFFECT for the period, not its raw balance change. */
  changeAmount: moneySchema,
});
export type CashFlowRowDto = z.infer<typeof cashFlowRowSchema>;

export const cashFlowReportSchema = z.object({
  fromDate: isoDate,
  toDate: isoDate,
  currency: z.string(),
  netIncome: moneySchema,
  adjustments: z.array(cashFlowRowSchema),
  netCashFromOperations: moneySchema,
  openingCash: moneySchema,
  closingCash: moneySchema,
  /** True when netIncome + sum(adjustments) equals closingCash - openingCash. */
  isConsistent: z.boolean(),
});
export type CashFlowReportDto = z.infer<typeof cashFlowReportSchema>;
