import { useTranslation } from 'react-i18next';
import type { PurchaseAnalysisGroupByDto, PurchaseAnalysisRowDto } from '@erp-platform/contracts';
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
import { formatPercent, formatQuantity, monthLabel } from '../../../../components/report/report-format';
import { minorUnitsToDecimalString } from '../../../../lib/money';
import { downloadXlsx } from '../../../../lib/xlsx';
import { usePurchaseAnalysis } from '../../api/purchase-reports/queries';
import { SupplierPicker } from '../../lib/supplier-picker';

const GROUPS: PurchaseAnalysisGroupByDto[] = ['supplier', 'item', 'category', 'month'];

/** تحليل المشتريات — purchases net of returns by supplier / item / category / month. */
export function PurchaseAnalysisPage() {
  const { t } = useTranslation();
  const params = useReportParams();
  const groupByParam = params.get('groupBy') as PurchaseAnalysisGroupByDto | null;
  const groupBy: PurchaseAnalysisGroupByDto = groupByParam && GROUPS.includes(groupByParam) ? groupByParam : 'supplier';
  const supplierId = params.get('supplier') ?? undefined;
  const { data: report, isLoading } = usePurchaseAnalysis({ groupBy, fromDate: params.from, toDate: params.to, supplierId });
  const showQuantity = groupBy === 'item' || groupBy === 'category';
  const showAverage = groupBy === 'item';
  const columns = 5 + (showQuantity ? 1 : 0) + (showAverage ? 1 : 0);

  const labelOf = (row: PurchaseAnalysisRowDto) =>
    groupBy === 'category' && row.key === null
      ? t('purchaseAnalysis.noCategory')
      : groupBy === 'month' && row.key
        ? monthLabel(row.key)
        : row.label;

  function exportXlsx() {
    if (!report) return;
    const money = (v: string | null) => (v === null ? '' : Number(minorUnitsToDecimalString(v)));
    downloadXlsx(
      `${t('purchaseAnalysis.title')} ${report.fromDate ?? ''} ${report.toDate ?? ''}`.trim(),
      [
        t(`purchaseAnalysis.groups.${groupBy}`),
        ...(showQuantity ? [t('purchaseAnalysis.quantity')] : []),
        t('purchaseAnalysis.gross'),
        t('purchaseAnalysis.returns'),
        t('purchaseAnalysis.net'),
        ...(showAverage ? [t('purchaseAnalysis.averageCost')] : []),
        t('purchaseAnalysis.share'),
        t('purchaseAnalysis.invoiceCount'),
      ],
      report.rows.map((row) => [
        row.secondaryLabel ? `${labelOf(row)} (${row.secondaryLabel})` : labelOf(row),
        ...(showQuantity ? [row.quantity ?? 0] : []),
        money(row.grossPurchasesMinorUnits),
        money(row.returnsMinorUnits),
        money(row.netPurchasesMinorUnits),
        ...(showAverage ? [money(row.averageUnitCostMinorUnits)] : []),
        row.sharePercent ?? '',
        row.invoiceCount,
      ]),
    );
  }

  return (
    <div className="grid gap-5">
      <PageHeader title={t('purchaseAnalysis.title')} description={t('purchaseAnalysis.subtitle')} />
      <ReportFrame
        title={`${t('purchaseAnalysis.title')} — ${t(`purchaseAnalysis.groups.${groupBy}`)}`}
        period={periodText(t, params.from, params.to)}
        loading={isLoading}
        onExport={report ? exportXlsx : undefined}
        filters={
          <>
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">{t('purchaseAnalysis.groupBy')}</span>
              <Select value={groupBy} onValueChange={(value) => params.set({ groupBy: value === 'supplier' ? null : value })}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUPS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {t(`purchaseAnalysis.groups.${g}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <PeriodPicker from={params.from} to={params.to} onChange={(range) => params.set(range)} />
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">{t('purchases.purchaseOrders.supplier')}</span>
              <div className="flex items-center gap-1">
                <SupplierPicker className="w-56" value={supplierId ?? null} onChange={(id) => params.set({ supplier: id })} />
                {supplierId ? (
                  <Button variant="ghost" size="icon" aria-label={t('purchaseAnalysis.clearSupplier')} onClick={() => params.set({ supplier: null })}>
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
                {t('purchaseAnalysis.foreignExcluded', { count: report.excludedForeignCurrencyDocuments, currency: report.currency })}
              </p>
            ) : null}
            <ReportSection>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t(`purchaseAnalysis.groups.${groupBy}`)}</TableHead>
                    {showQuantity ? <TableHead className={AMOUNT_CELL}>{t('purchaseAnalysis.quantity')}</TableHead> : null}
                    <TableHead className={AMOUNT_CELL}>
                      {t('purchaseAnalysis.gross')} <span className="text-xs font-normal">({report.currency})</span>
                    </TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('purchaseAnalysis.returns')}</TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('purchaseAnalysis.net')}</TableHead>
                    {showAverage ? <TableHead className={AMOUNT_CELL}>{t('purchaseAnalysis.averageCost')}</TableHead> : null}
                    <TableHead className={AMOUNT_CELL}>{t('purchaseAnalysis.share')}</TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('purchaseAnalysis.invoiceCount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.key ?? 'none'}>
                      <TableCell>
                        <span className={row.key === null ? 'text-muted-foreground' : 'font-medium'}>{labelOf(row)}</span>
                        {row.secondaryLabel ? <span className="ms-2 text-xs tabular-nums text-muted-foreground">{row.secondaryLabel}</span> : null}
                      </TableCell>
                      {showQuantity ? <TableCell className={AMOUNT_CELL}>{formatQuantity(row.quantity)}</TableCell> : null}
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={row.grossPurchasesMinorUnits} hideCurrency />
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={row.returnsMinorUnits} hideCurrency zeroAsDash />
                      </TableCell>
                      <TableCell className={`${AMOUNT_CELL} font-medium`}>
                        <Amount value={row.netPurchasesMinorUnits} hideCurrency />
                      </TableCell>
                      {showAverage ? (
                        <TableCell className={AMOUNT_CELL}>
                          <Amount value={row.averageUnitCostMinorUnits} hideCurrency />
                        </TableCell>
                      ) : null}
                      <TableCell className={AMOUNT_CELL}>{formatPercent(row.sharePercent)}</TableCell>
                      <TableCell className={AMOUNT_CELL}>{row.invoiceCount}</TableCell>
                    </TableRow>
                  ))}
                  {report.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns} className="py-10 text-center text-muted-foreground">
                        {t('purchaseAnalysis.empty')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
                {report.rows.length > 0 ? (
                  <TableFooter>
                    <TableRow className="font-semibold">
                      <TableCell colSpan={showQuantity ? 2 : 1}>{t('documents.total')}</TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={report.totals.grossPurchasesMinorUnits} hideCurrency />
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={report.totals.returnsMinorUnits} hideCurrency zeroAsDash />
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={report.totals.netPurchasesMinorUnits} hideCurrency />
                      </TableCell>
                      {showAverage ? <TableCell /> : null}
                      <TableCell className={AMOUNT_CELL}>100%</TableCell>
                      <TableCell className={AMOUNT_CELL}>{report.totals.invoiceCount}</TableCell>
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </ReportSection>
            <p className="text-xs text-muted-foreground">{t('purchaseAnalysis.note')}</p>
          </div>
        ) : null}
      </ReportFrame>
    </div>
  );
}
