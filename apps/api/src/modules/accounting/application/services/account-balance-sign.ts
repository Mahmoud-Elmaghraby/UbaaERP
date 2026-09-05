import type { AccountType } from '../../domain/chart-of-account.entity';

/**
 * The canonical increasing side for a whole account category — asset and
 * expense accounts increase on the debit side; liability, equity, and
 * revenue accounts increase on the credit side. Used uniformly across
 * every report in AccountingReportsService (general ledger running
 * balance, trial balance's convenience balance column, income statement,
 * balance sheet) INSTEAD OF each individual account's own normalBalance
 * column — deliberately, so a contra account (e.g. code 42, "Sales
 * Returns & Allowances", accountType 'revenue' but normalBalance
 * 'debit', see migration 0048) still nets correctly into its category's
 * total: it stays categorized as revenue, so it uses revenue's
 * credit-canonical sign, which makes its mostly-debited balance compute
 * as negative — correctly reducing total revenue when summed with
 * ordinary revenue accounts. normalBalance itself remains stored
 * chart-of-accounts metadata, not report arithmetic.
 */
export function categoryCanonicalSide(accountType: AccountType): 'debit' | 'credit' {
  return accountType === 'asset' || accountType === 'expense' ? 'debit' : 'credit';
}
