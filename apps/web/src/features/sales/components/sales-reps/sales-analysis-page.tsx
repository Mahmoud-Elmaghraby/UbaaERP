import { useEffect } from 'react';
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
  useFeatureChecker,
} from '@erp-platform/ui';
import { X } from 'lucide-react';

import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { PeriodPicker, ReportFrame, ReportSection, periodText, useReportParams } from '../../../../components/report/report-layout';
import { formatPercent as formatMargin, formatQuantity, monthLabel } from '../../../../components/report/report-format';
import { minorUnitsToDecimalString } from '../../../../lib/money';
import { downloadXlsx } from '../../../../lib/xlsx';
import { CustomerPicker } from '../../lib/customer-picker';
import { useSalesAnalysis } from '../../api/sales-reps/queries';
import { SalesRepSelect } from './sales-rep-select';

/** Every grouping, with the activity switch it needs (none = always). */
const GROUPS: { id: SalesAnalysisGroupByDto; feature?: string }[] = [
  { id: 'rep', feature: 'sales.reps' },
  { id: 'item' },
  { id: 'product' },
  { id: 'category' },
  { id: 'option' },
  { id: 'customer' },
  { id: 'cashier', feature: 'pos' },
  { id: 'channel', feature: 'sales.channels' },
  { id: 'month' },
];
const QUANTITY_GROUPS: SalesAnalysisGroupByDto[] = ['item', 'product', 'category', 'option'];

/**
 * تحليل المبيعات — net sales, cost, gross profit and margin by rep / item / product / category /
 * size or colour / customer / cashier / channel (with the platform fees) / month.
 */
export function SalesAnalysisPage() {
  const { t } = useTranslation();
  const params = useReportParams();
  const hasFeature = useFeatureChecker();
  const groups = GROUPS.filter((g) => !g.feature || hasFeature(g.feature)).map((g) => g.id);
  const groupByParam = params.get('groupBy') as SalesAnalysisGroupByDto | null;
  const groupBy: SalesAnalysisGroupByDto = groupByParam && groups.includes(groupByParam) ? groupByParam : (groups[0] ?? 'item');
  const salesRepId = params.get('rep') ?? undefined;
  const customerId = params.get('customer') ?? undefined;
  const optionParam = params.get('option') ?? undefined;
  const { data: report, isLoading } = useSalesAnalysis({
    groupBy,
    fromDate: params.from,
    toDate: params.to,
    salesRepId,
    customerId,
    optionName: groupBy === 'option' ? optionParam : undefined,
  });
  // Size / colour: the first option in use until one is picked.
  const optionName = optionParam ?? report?.optionNames[0];
  useEffect(() => {
    if (groupBy === 'option' && !optionParam && report?.optionNames[0]) params.set({ option: report.optionNames[0] });
  }, [groupBy, optionParam, report?.optionNames, params]);
  const showQuantity = QUANTITY_GROUPS.includes(groupBy);
  const showFees = groupBy === 'channel';
  const extraColumns = (showQuantity ? 1 : 0) + (showFees ? 2 : 0);

  const labelOf = (row: SalesAnalysisRowDto) => {
    if (groupBy === 'month' && row.key) return monthLabel(row.key);
    if (row.key === null) return t(`salesAnalysis.none.${groupBy}`, { defaultValue: '—' });
    return row.label;
  };

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
        ...(showFees ? [t('salesAnalysis.fees'), t('salesAnalysis.netProfit')] : []),
        t('salesAnalysis.margin'),
        t('salesAnalysis.invoiceCount'),
      ],
      report.rows.map((row) => [
        row.secondaryLabel ? `${labelOf(row)} (${row.secondaryLabel})` : labelOf(row),
        ...(showQuantity ? [row.quantity ?? 0] : []),
        money(row.netSalesMinorUnits),
        money(row.costOfGoodsSoldMinorUnits),
        money(row.grossProfitMinorUnits),
        ...(showFees ? [money(row.feesMinorUnits ?? '0'), money(row.netProfitMinorUnits ?? row.grossProfitMinorUnits)] : []),
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
                  {groups.map((g) => (
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
            {groupBy === 'option' && report?.optionNames.length ? (
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">{t('salesAnalysis.option')}</span>
                <Select value={optionName} onValueChange={(value) => params.set({ option: value })}>
                  <SelectTrigger className="h-9 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {report.optionNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
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
                    <TableHead>{groupBy === 'option' && optionName ? optionName : t(`salesAnalysis.groups.${groupBy}`)}</TableHead>
                    {showQuantity ? <TableHead className={AMOUNT_CELL}>{t('salesAnalysis.quantity')}</TableHead> : null}
                    <TableHead className={AMOUNT_CELL}>
                      {t('salesAnalysis.netSales')} <span className="text-xs font-normal">({report.currency})</span>
                    </TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('salesAnalysis.cogs')}</TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('salesAnalysis.grossProfit')}</TableHead>
                    {showFees ? <TableHead className={AMOUNT_CELL}>{t('salesAnalysis.fees')}</TableHead> : null}
                    {showFees ? <TableHead className={AMOUNT_CELL}>{t('salesAnalysis.netProfit')}</TableHead> : null}
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
                      {showFees ? (
                        <TableCell className={AMOUNT_CELL}>
                          <Amount value={row.feesMinorUnits ?? '0'} hideCurrency zeroAsDash />
                        </TableCell>
                      ) : null}
                      {showFees ? (
                        <TableCell className={`${AMOUNT_CELL} font-medium`}>
                          <Amount value={row.netProfitMinorUnits ?? row.grossProfitMinorUnits} hideCurrency />
                        </TableCell>
                      ) : null}
                      <TableCell className={AMOUNT_CELL}>{formatMargin(row.marginPercent)}</TableCell>
                      <TableCell className={AMOUNT_CELL}>{row.invoiceCount}</TableCell>
                    </TableRow>
                  ))}
                  {report.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6 + extraColumns} className="py-10 text-center text-muted-foreground">
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
                      {showFees ? (
                        <TableCell className={AMOUNT_CELL}>
                          <Amount value={report.totals.feesMinorUnits ?? '0'} hideCurrency />
                        </TableCell>
                      ) : null}
                      {showFees ? (
                        <TableCell className={AMOUNT_CELL}>
                          <Amount value={report.totals.netProfitMinorUnits ?? report.totals.grossProfitMinorUnits} hideCurrency />
                        </TableCell>
                      ) : null}
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
