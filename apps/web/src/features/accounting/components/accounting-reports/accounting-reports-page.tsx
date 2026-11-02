import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader, cn } from '@erp-platform/ui';

import { GeneralLedgerReport } from './general-ledger-report';
import { TrialBalanceReport } from './trial-balance-report';
import { IncomeStatementReport } from './income-statement-report';
import { BalanceSheetReport } from './balance-sheet-report';
import { CashFlowReport } from './cash-flow-report';
import { VatReturnReport } from './vat-return-report';

const REPORTS = {
  'trial-balance': { label: 'accounting.reports.trialBalance', Component: TrialBalanceReport },
  'income-statement': { label: 'accounting.reports.incomeStatement', Component: IncomeStatementReport },
  'balance-sheet': { label: 'accounting.reports.balanceSheet', Component: BalanceSheetReport },
  'general-ledger': { label: 'accounting.reports.generalLedger', Component: GeneralLedgerReport },
  'cash-flow': { label: 'accounting.reports.cashFlow', Component: CashFlowReport },
  'vat-return': { label: 'accounting.reports.vatReturn', Component: VatReturnReport },
} as const;
type ReportKey = keyof typeof REPORTS;

/**
 * Accounting reports: one route per report (/accounting/reports/:report), so
 * a report can be bookmarked and other reports can drill into it (trial
 * balance → general ledger → journal entry). Filters live in the URL.
 */
export function AccountingReportsPage() {
  const { t } = useTranslation();
  const { report } = useParams<{ report: string }>();
  if (!report || !(report in REPORTS)) return <Navigate to="/accounting/reports/trial-balance" replace />;
  const { Component } = REPORTS[report as ReportKey];

  return (
    <div className="grid gap-5">
      <div className="print:hidden">
        <PageHeader title={t('accounting.tabs.reports')} />
      </div>
      <nav className="-mb-1 flex gap-1 overflow-x-auto border-b print:hidden" aria-label={t('accounting.tabs.reports')}>
        {(Object.keys(REPORTS) as ReportKey[]).map((key) => (
          <NavLink
            key={key}
            to={`/accounting/reports/${key}`}
            className={({ isActive }) =>
              cn(
                '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            {t(REPORTS[key].label)}
          </NavLink>
        ))}
      </nav>
      <Component />
    </div>
  );
}
