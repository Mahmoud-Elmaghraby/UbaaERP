import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@erp-platform/ui';

import { useBalanceSheetReport } from '../../api/accounting-reports/queries';
import { DateField, ReportFrame, ReportSection, asOfText, useReportParams } from '../../../../components/report/report-layout';
import { formatDate } from '../../../../lib/format-date';
import { minorUnitsToDecimalString } from '../../../../lib/money';
import { downloadXlsx } from '../../../../lib/xlsx';
import { StatementTable, mergeAccountRows, type StatementLine } from './statement-table';
import { CompareToggle } from './income-statement-report';
import { sameDateLastYear } from './period-math';

/**
 * الميزانية العمومية — assets, liabilities and equity at a date. Unclosed
 * profit shows as two equity lines (earlier years / this year) until the
 * year-end closing exists. Optionally next to the same date last year.
 */
export function BalanceSheetReport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useReportParams();
  const compare = params.get('compare') === '1';
  const prevDate = sameDateLastYear(params.asOf);
  const current = useBalanceSheetReport(params.asOf);
  const previous = useBalanceSheetReport(compare ? prevDate : undefined);
  const report = current.data;
  const reports = compare ? [report, previous.data] : [report];
  const columns = [formatDate(params.asOf), ...(compare ? [formatDate(prevDate)] : [])];
  const openLedger = (accountId: string) =>
    navigate(`/accounting/reports/general-ledger?account=${accountId}&from=${params.asOf.slice(0, 4)}-01-01&to=${params.asOf}`);
  const values = (pick: (r: NonNullable<typeof report>) => string) => reports.map((r) => (r ? pick(r) : undefined));

  const lines: StatementLine[] = report
    ? [
        { key: 'a-h', label: t('accounting.reports.assets'), values: [], level: 'subtotal' },
        ...mergeAccountRows(reports.map((r) => r?.assetRows), openLedger),
        { key: 'a-t', label: t('accounting.reports.totalAssets'), values: values((r) => r.totalAssets.amountMinorUnits), level: 'total' },
        { key: 'l-h', label: t('accounting.reports.liabilities'), values: [], level: 'subtotal' },
        ...mergeAccountRows(reports.map((r) => r?.liabilityRows), openLedger),
        {
          key: 'l-t',
          label: t('accounting.reports.totalLiabilities'),
          values: values((r) => r.totalLiabilities.amountMinorUnits),
          level: 'subtotal',
        },
        { key: 'e-h', label: t('accounting.reports.equity'), values: [], level: 'subtotal' },
        ...mergeAccountRows(reports.map((r) => r?.equityRows), openLedger),
        {
          key: 'e-prior',
          label: t('accounting.reports.priorYearsEarnings'),
          values: values((r) => r.priorYearsEarnings.amountMinorUnits),
        },
        {
          key: 'e-current',
          label: t('accounting.reports.currentYearEarnings'),
          values: values((r) => r.currentYearEarnings.amountMinorUnits),
        },
        { key: 'e-t', label: t('accounting.reports.totalEquity'), values: values((r) => r.totalEquity.amountMinorUnits), level: 'subtotal' },
        {
          key: 'le-t',
          label: t('accounting.reports.totalLiabilitiesAndEquity'),
          values: reports.map((r) =>
            r ? (BigInt(r.totalLiabilities.amountMinorUnits) + BigInt(r.totalEquity.amountMinorUnits)).toString() : undefined,
          ),
          level: 'total',
        },
      ]
    : [];

  function exportXlsx() {
    downloadXlsx(
      `${t('accounting.reports.balanceSheet')} ${params.asOf}`,
      [t('accounting.chartOfAccounts.code'), t('accounting.chartOfAccounts.name'), ...columns],
      lines.map((line) => [
        line.code ?? '',
        typeof line.label === 'string' ? line.label : '',
        ...line.values.map((v) => (v === undefined ? null : Number(minorUnitsToDecimalString(v)))),
      ]),
    );
  }

  return (
    <ReportFrame
      title={t('accounting.reports.balanceSheet')}
      period={asOfText(t, params.asOf)}
      loading={current.isLoading}
      onExport={report ? exportXlsx : undefined}
      filters={
        <>
          <DateField label={t('accounting.reports.asOfDate')} value={params.asOf} onChange={(asOf) => params.set({ asOf })} />
          <CompareToggle checked={compare} onChange={(on) => params.set({ compare: on ? '1' : null })} />
          {report ? (
            <Badge variant={report.isBalanced ? 'success' : 'danger'} className="mb-1.5">
              {report.isBalanced ? t('accounting.reports.balanced') : t('accounting.reports.unbalanced')}
            </Badge>
          ) : null}
        </>
      }
    >
      {report ? (
        <ReportSection>
          <StatementTable columns={columns} lines={lines} />
        </ReportSection>
      ) : null}
    </ReportFrame>
  );
}
