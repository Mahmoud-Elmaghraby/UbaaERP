import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@erp-platform/ui';

import { useCashFlowReport } from '../../api/accounting-reports/queries';
import { PeriodPicker, ReportFrame, ReportSection, periodText, useReportParams } from '../../../../components/report/report-layout';
import { formatDate } from '../../../../lib/format-date';
import { minorUnitsToDecimalString } from '../../../../lib/money';
import { downloadXlsx } from '../../../../lib/xlsx';
import { StatementTable, type StatementLine } from './statement-table';

/** قائمة التدفقات النقدية (indirect method) — net profit adjusted by balance-sheet changes. */
export function CashFlowReport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useReportParams();
  const { data: report, isLoading } = useCashFlowReport({ fromDate: params.from, toDate: params.to });
  const columns = [`${formatDate(params.from)} – ${formatDate(params.to)}`];

  const lines: StatementLine[] = report
    ? [
        { key: 'ni', label: t('accounting.reports.netIncome'), values: [report.netIncome.amountMinorUnits], level: 'subtotal' },
        { key: 'adj-h', label: t('accounting.reports.operatingAdjustments'), values: [], level: 'subtotal' },
        ...report.adjustments.map((row) => ({
          key: row.accountId,
          code: row.accountCode,
          label: row.accountName,
          values: [row.changeAmount.amountMinorUnits],
          onOpen: () =>
            navigate(`/accounting/reports/general-ledger?account=${row.accountId}&from=${params.from}&to=${params.to}`),
        })),
        {
          key: 'ops',
          label: t('accounting.reports.netCashFromOperations'),
          values: [report.netCashFromOperations.amountMinorUnits],
          level: 'total',
        },
        { key: 'open', label: t('accounting.reports.openingCash'), values: [report.openingCash.amountMinorUnits], level: 'subtotal' },
        { key: 'close', label: t('accounting.reports.closingCash'), values: [report.closingCash.amountMinorUnits], level: 'total' },
      ]
    : [];

  function exportXlsx() {
    downloadXlsx(
      `${t('accounting.reports.cashFlow')} ${params.from} ${params.to}`,
      [t('accounting.chartOfAccounts.code'), t('accounting.chartOfAccounts.name'), columns[0]!],
      lines.map((line) => [
        line.code ?? '',
        typeof line.label === 'string' ? line.label : '',
        line.values[0] === undefined ? null : Number(minorUnitsToDecimalString(line.values[0])),
      ]),
    );
  }

  return (
    <ReportFrame
      title={t('accounting.reports.cashFlow')}
      period={periodText(t, params.from, params.to)}
      loading={isLoading}
      onExport={report ? exportXlsx : undefined}
      filters={
        <>
          <PeriodPicker from={params.from} to={params.to} onChange={(range) => params.set(range)} />
          {report ? (
            <Badge variant={report.isConsistent ? 'success' : 'danger'} className="mb-1.5">
              {report.isConsistent ? t('accounting.reports.consistent') : t('accounting.reports.inconsistent')}
            </Badge>
          ) : null}
        </>
      }
    >
      {report ? (
        <>
          <p className="text-sm text-muted-foreground print:hidden">{t('accounting.reports.cashFlowNote')}</p>
          <ReportSection>
            <StatementTable columns={columns} lines={lines} />
          </ReportSection>
        </>
      ) : null}
    </ReportFrame>
  );
}
