import { useTranslation } from 'react-i18next';
import type { SalesAnalysisGroupByDto, SalesAnalysisRowDto } from '@erp-platform/contracts';
import {
  Button,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';
import { X } from 'lucide-react';

import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { PeriodPicker, ReportFrame, ReportSection, periodText, useReportParams } from '../../../../components/report/report-layout';
import { minorUnitsToDecimalString } from '../../../../lib/money';
import { downloadXlsx } from '../../../../lib/xlsx';
import { CustomerPicker } from '../../lib/customer-picker';
import { useSalesAnalysis } from '../../api/sales-reps/queries';
import { SalesRepSelect } from './sales-rep-select';

const GROUPS: SalesAnalysisGroupByDto[] = ['rep', 'item', 'customer', 'month'];

/** تحليل المبيعات — net sales, cost, gross profit and margin by rep / item / customer / month. */
export function SalesAnalysisPage() {
  const { t } = useTranslation();
  const params = useReportParams();
  const groupByParam = params.get('groupBy') as SalesAnalysisGroupByDto | null;
  const groupBy: SalesAnalysisGroupByDto = groupByParam && GROUPS.includes(groupByParam) ? groupByParam : 'rep';
  const salesRepId = params.get('rep') ?? undefined;
  const customerId = params.get('customer') ?? undefined;
  const { data: report, isLoading } = useSalesAnalysis({ groupBy, fromDate: params.from, toDate: params.to, salesRepId, customerId });
  const showQuantity = groupBy === 'item';

  const labelOf = (row: SalesAnalysisRowDto) =>
    groupBy === 'rep' && row.key === null ? t('salesReps.noRep') : groupBy === 'month' && row.key ? monthLabel(row.key) : row.label;

  function exportXlsx() {
    if (!report) return;
    const money = (v: string) => Number(minorUnitsToDecimalString(v));
    downloadXlsx(
      `${t('salesAnalysis.title')} ${report.fromDate ?? ''} ${report.toDate ?? ''}`.trim(),
      [
        t(`salesAnalysis.groups.${groupBy}`),
        ...(showQuantity ? [t('salesAnalysis.quantity')] : []),
        t('salesAnalysis.netSales'),
        t('salesAnalysis.cogs'),
        t('salesAnalysis.grossProfit'),
        t('salesAnalysis.margin'),
        t('salesAnalysis.invoiceCount'),
      ],
      report.rows.map((row) => [
        row.secondaryLabel ? `${labelOf(row)} (${row.secondaryLabel})` : labelOf(row),
        ...(showQuantity ? [row.quantity ?? 0] : []),
        money(row.netSalesMinorUnits),
        money(row.costOfGoodsSoldMinorUnits),
        money(row.grossProfitMinorUnits),
        row.marginPercent ?? '',
        row.invoiceCount,
      ]),
    );
  }

  return (
    <div className="grid gap-5">
      <PageHeader title={t('salesAnalysis.title')} description={t('salesAnalysis.subtitle')} />
      <ReportFrame
        title={`${t('salesAnalysis.title')} — ${t(`salesAnalysis.groups.${groupBy}`)}`}
        period={periodText(t, params.from, params.to)}
        loading={isLoading}
        onExport={report ? exportXlsx : undefined}
        filters={
          <>
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">{t('salesAnalysis.groupBy')}</span>
              <Select value={groupBy} onValueChange={(value) => params.set({ groupBy: value === 'rep' ? null : value })}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUPS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {t(`salesAnalysis.groups.${g}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <PeriodPicker from={params.from} to={params.to} onChange={(range) => params.set(range)} />
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">{t('salesReps.field')}</span>
              <SalesRepSelect className="h-9 w-44" value={salesRepId ?? null} onChange={(id) => params.set({ rep: id })} />
            </div>
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">{t('salesAnalysis.customer')}</span>
              <div className="flex items-center gap-1">
                <CustomerPicker className="w-56" value={customerId ?? null} onChange={(id) => params.set({ customer: id })} />
                {customerId ? (
                  <Button variant="ghost" size="icon" aria-label={t('salesAnalysis.clearCustomer')} onClick={() => params.set({ customer: null })}>
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        }
      >
        {report ? (
          <div className="grid gap-2">
            {report.excludedForeignCurrencyDocuments > 0 ? (
              <p className="text-xs text-muted-foreground print:hidden">
                {t('salesAnalysis.foreignExcluded', { count: report.excludedForeignCurrencyDocuments, currency: report.currency })}
              </p>
            ) : null}
            <ReportSection>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t(`salesAnalysis.groups.${groupBy}`)}</TableHead>
                    {showQuantity ? <TableHead className={AMOUNT_CELL}>{t('salesAnalysis.quantity')}</TableHead> : null}
                    <TableHead className={AMOUNT_CELL}>
                      {t('salesAnalysis.netSales')} <span className="text-xs font-normal">({report.currency})</span>
                    </TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('salesAnalysis.cogs')}</TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('salesAnalysis.grossProfit')}</TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('salesAnalysis.margin')}</TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('salesAnalysis.invoiceCount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.key ?? 'none'}>
                      <TableCell>
                        <span className={row.key === null ? 'text-muted-foreground' : 'font-medium'}>{labelOf(row)}</span>
                        {row.secondaryLabel ? (
                          <span className="ms-2 text-xs tabular-nums text-muted-foreground">{row.secondaryLabel}</span>
                        ) : null}
                      </TableCell>
                      {showQuantity ? <TableCell className={AMOUNT_CELL}>{formatQuantity(row.quantity)}</TableCell> : null}
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={row.netSalesMinorUnits} hideCurrency />
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={row.costOfGoodsSoldMinorUnits} hideCurrency zeroAsDash />
                      </TableCell>
                      <TableCell className={`${AMOUNT_CELL} font-medium`}>
                        <Amount value={row.grossProfitMinorUnits} hideCurrency />
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>{formatMargin(row.marginPercent)}</TableCell>
                      <TableCell className={AMOUNT_CELL}>{row.invoiceCount}</TableCell>
                    </TableRow>
                  ))}
                  {report.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={showQuantity ? 7 : 6} className="py-10 text-center text-muted-foreground">
                        {t('salesAnalysis.empty')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
                {report.rows.length > 0 ? (
                  <TableFooter>
                    <TableRow className="font-semibold">
                      <TableCell colSpan={showQuantity ? 2 : 1}>{t('salesAnalysis.total')}</TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={report.totals.netSalesMinorUnits} hideCurrency />
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={report.totals.costOfGoodsSoldMinorUnits} hideCurrency />
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={report.totals.grossProfitMinorUnits} hideCurrency />
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>{formatMargin(report.totals.marginPercent)}</TableCell>
                      <TableCell className={AMOUNT_CELL}>{report.totals.invoiceCount}</TableCell>
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </ReportSection>
            <p className="text-xs text-muted-foreground">{t('salesAnalysis.note')}</p>
          </div>
        ) : null}
      </ReportFrame>
    </div>
  );
}

function formatMargin(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}

function formatQuantity(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

/** "2026-11" → "نوفمبر 2026". */
function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
