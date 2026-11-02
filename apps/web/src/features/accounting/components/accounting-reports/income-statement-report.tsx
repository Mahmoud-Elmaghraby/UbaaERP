import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Checkbox, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { useActiveCostCenters } from '../../hooks/use-active-cost-centers';

const ALL = '__all__';

import { useIncomeStatementReport } from '../../api/accounting-reports/queries';
import { PeriodPicker, ReportFrame, ReportSection, periodText, useReportParams } from '../../../../components/report/report-layout';
import { formatDate } from '../../../../lib/format-date';
import { minorUnitsToDecimalString } from '../../../../lib/money';
import { downloadXlsx } from '../../../../lib/xlsx';
import { StatementTable, mergeAccountRows, type StatementLine } from './statement-table';
import { previousPeriod } from './period-math';

/** قائمة الدخل — revenue, expenses and net profit for a period, optionally next to the previous period. */
export function IncomeStatementReport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useReportParams();
  const compare = params.get('compare') === '1';
  const costCenterId = params.get('costCenter');
  const costCenters = useActiveCostCenters();
  const prev = previousPeriod(params.from, params.to);
  const current = useIncomeStatementReport({ fromDate: params.from, toDate: params.to, costCenterId });
  const previous = useIncomeStatementReport({
    fromDate: compare ? prev.from : undefined,
    toDate: compare ? prev.to : undefined,
    costCenterId,
  });
  const costCenter = costCenters.find((c) => c.id === costCenterId);
  const report = current.data;
  const reports = compare ? [report, previous.data] : [report];

  const columns = [
    `${formatDate(params.from)} – ${formatDate(params.to)}`,
    ...(compare ? [`${formatDate(prev.from)} – ${formatDate(prev.to)}`] : []),
  ];
  const openLedger = (accountId: string) =>
    navigate(`/accounting/reports/general-ledger?account=${accountId}&from=${params.from}&to=${params.to}`);

  const lines: StatementLine[] = report
    ? [
        { key: 'rev-h', label: t('accounting.reports.revenue'), values: [], level: 'subtotal' },
        ...mergeAccountRows(reports.map((r) => r?.revenueRows), openLedger),
        {
          key: 'rev-t',
          label: t('accounting.reports.totalRevenue'),
          values: reports.map((r) => r?.totalRevenue.amountMinorUnits),
          level: 'subtotal',
        },
        { key: 'exp-h', label: t('accounting.reports.expenses'), values: [], level: 'subtotal' },
        ...mergeAccountRows(reports.map((r) => r?.expenseRows), openLedger),
        {
          key: 'exp-t',
          label: t('accounting.reports.totalExpense'),
          values: reports.map((r) => r?.totalExpense.amountMinorUnits),
          level: 'subtotal',
        },
        {
          key: 'net',
          label: t('accounting.reports.netIncome'),
          values: reports.map((r) => r?.netIncome.amountMinorUnits),
          level: 'total',
        },
      ]
    : [];

  function exportXlsx() {
    downloadXlsx(
      `${t('accounting.reports.incomeStatement')} ${params.from} ${params.to}`,
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
      title={
        costCenter
          ? `${t('accounting.reports.incomeStatement')} — ${costCenter.code} ${costCenter.name}`
          : t('accounting.reports.incomeStatement')
      }
      period={periodText(t, params.from, params.to)}
      loading={current.isLoading}
      onExport={report ? exportXlsx : undefined}
      filters={
        <>
          <PeriodPicker from={params.from} to={params.to} onChange={(range) => params.set(range)} />
          {costCenters.length > 0 ? (
            <label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">{t('accounting.journalEntries.lineCostCenter')}</span>
              <Select value={costCenterId ?? ALL} onValueChange={(v) => params.set({ costCenter: v === ALL ? null : v })}>
                <SelectTrigger className="h-9 w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t('accounting.reports.allCostCenters')}</SelectItem>
                  {costCenters.map((center) => (
                    <SelectItem key={center.id} value={center.id}>
                      {center.code} — {center.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : null}
          <CompareToggle checked={compare} onChange={(on) => params.set({ compare: on ? '1' : null })} />
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

export function CompareToggle({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <label className="mb-2 flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {t('reports.compare')}
    </label>
  );
}
