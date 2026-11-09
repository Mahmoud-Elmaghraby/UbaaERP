import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { OutboxSummaryDto } from '@erp-platform/contracts';
import { Button, Can, PageHeader, Skeleton, cn, useHasPermission } from '@erp-platform/ui';
import { AlertTriangle, BookOpen, CalendarRange, FileSpreadsheet, Landmark, ListTree, Plus, Scale, Building2, PiggyBank, Repeat } from 'lucide-react';

import { useBalanceSheetReport, useIncomeStatementReport } from '../../api/accounting-reports/queries';
import { useJournalEntries } from '../../api/journal-entries/queries';
import { useFiscalYears } from '../../api/fiscal-years/queries';
import { apiGet } from '../../../../lib/api-client';
import { todayIso } from '../../../../lib/format-date';
import { Amount } from '../../../../components/amount';
import { presetRange } from '../../../../components/report/report-layout';

/**
 * /accounting — the accountant's start page: this month's and this year's
 * result, the balance-sheet totals, and what needs attention (unposted
 * drafts, operations that failed to post, a year that ended but isn't
 * closed), plus the usual ways in.
 */
export function AccountingOverviewPage() {
  const { t } = useTranslation();
  const today = todayIso();
  const month = presetRange('thisMonth');
  const year = presetRange('thisYear');
  const monthResult = useIncomeStatementReport({ fromDate: month.from, toDate: today });
  const yearResult = useIncomeStatementReport({ fromDate: year.from, toDate: today });
  const balanceSheet = useBalanceSheetReport(today);
  const drafts = useJournalEntries({ status: 'draft' });
  const { data: fiscalYears } = useFiscalYears();
  const canSeeOperations = useHasPermission('settings.manage');
  const operations = useQuery({
    queryKey: ['outbox-events', 'summary'],
    queryFn: () => apiGet<OutboxSummaryDto>('/outbox-events/summary'),
    enabled: canSeeOperations,
  });

  const currency = balanceSheet.data?.currency ?? '';
  const unclosedYears = (fiscalYears ?? []).filter((fy) => fy.status === 'open' && fy.endDate < today);
  const alerts: { key: string; text: string; to: string }[] = [];
  if ((operations.data?.failed ?? 0) > 0) {
    alerts.push({ key: 'failed', text: t('accounting.overview.failedOperations', { count: operations.data!.failed }), to: '/settings/operations' });
  }
  if ((drafts.data?.length ?? 0) > 0) {
    alerts.push({ key: 'drafts', text: t('accounting.overview.drafts', { count: drafts.data!.length }), to: '/accounting/journal-entries?status=draft' });
  }
  for (const fy of unclosedYears) {
    alerts.push({ key: fy.id, text: t('accounting.overview.yearToClose', { name: fy.name }), to: '/accounting/fiscal-years' });
  }
  if (balanceSheet.data && !balanceSheet.data.isBalanced) {
    alerts.push({ key: 'unbalanced', text: t('accounting.overview.unbalanced'), to: '/accounting/reports/balance-sheet' });
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('accounting.overview.title')}
        description={t('accounting.overview.subtitle')}
        actions={
          <Can permission="accounting.manage">
            <Button asChild>
              <Link to="/accounting/journal-entries/new">
                <Plus className="me-1 h-4 w-4" />
                {t('accounting.journalEntries.newEntry')}
              </Link>
            </Button>
          </Can>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label={t('accounting.overview.monthResult')}
          value={monthResult.data?.netIncome.amountMinorUnits}
          currency={currency}
          loading={monthResult.isLoading}
          to={`/accounting/reports/income-statement?from=${month.from}&to=${month.to}`}
          signed
        />
        <Kpi
          label={t('accounting.overview.yearResult')}
          value={yearResult.data?.netIncome.amountMinorUnits}
          currency={currency}
          loading={yearResult.isLoading}
          to={`/accounting/reports/income-statement?from=${year.from}&to=${year.to}`}
          signed
        />
        <Kpi
          label={t('accounting.reports.totalAssets')}
          value={balanceSheet.data?.totalAssets.amountMinorUnits}
          currency={currency}
          loading={balanceSheet.isLoading}
          to="/accounting/reports/balance-sheet"
        />
        <Kpi
          label={t('accounting.reports.totalLiabilities')}
          value={balanceSheet.data?.totalLiabilities.amountMinorUnits}
          currency={currency}
          loading={balanceSheet.isLoading}
          to="/accounting/reports/balance-sheet"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-5 py-3 text-base font-semibold">{t('accounting.overview.attention')}</h2>
          {alerts.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">{t('accounting.overview.allGood')}</p>
          ) : (
            <ul className="divide-y">
              {alerts.map((alert) => (
                <li key={alert.key}>
                  <Link to={alert.to} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-muted/50">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                    <span className="flex-1">{alert.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-5 py-3 text-base font-semibold">{t('accounting.overview.shortcuts')}</h2>
          <div className="grid grid-cols-2 gap-2 p-4">
            <Shortcut to="/accounting/reports/trial-balance" icon={<Scale />} label={t('accounting.reports.trialBalance')} />
            <Shortcut to="/accounting/reports/general-ledger" icon={<BookOpen />} label={t('accounting.reports.generalLedger')} />
            <Shortcut to="/accounting/reports/vat-return" icon={<FileSpreadsheet />} label={t('accounting.reports.vatReturn')} />
            <Shortcut to="/accounting/chart-of-accounts" icon={<ListTree />} label={t('accounting.tabs.chartOfAccounts')} />
            <Shortcut to="/accounting/bank-accounts" icon={<Landmark />} label={t('accounting.bankAccounts.reconciliation')} />
            <Shortcut to="/accounting/fiscal-years" icon={<CalendarRange />} label={t('accounting.tabs.fiscalYears')} />
            <Shortcut to="/accounting/recurring-entries" icon={<Repeat />} label={t('accounting.tabs.recurring')} />
            <Shortcut to="/accounting/fixed-assets" icon={<Building2 />} label={t('accounting.tabs.fixedAssets')} />
            <Shortcut to="/accounting/budgets" icon={<PiggyBank />} label={t('accounting.tabs.budgets')} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  currency,
  loading,
  to,
  signed,
}: {
  label: string;
  value: string | undefined;
  currency: string;
  loading: boolean;
  to: string;
  signed?: boolean;
}) {
  const negative = value?.startsWith('-');
  return (
    <Link to={to} className="rounded-xl border bg-card px-5 py-4 transition-colors hover:border-primary/40">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-32" />
      ) : (
        <p className={cn('mt-1.5 text-2xl font-bold', signed && !negative && value !== '0' && 'text-success')}>
          <Amount value={value} currency={currency} />
        </p>
      )}
    </Link>
  );
}

function Shortcut({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted-foreground">
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}
