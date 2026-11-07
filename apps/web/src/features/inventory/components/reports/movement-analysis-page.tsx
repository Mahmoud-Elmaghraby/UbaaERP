import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MovementAnalysisRowDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Combobox,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { useMovementAnalysis } from '../../api/reports/queries';
import { useCategoryOptions } from '../../api/catalog/queries';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { PeriodPicker, ReportFrame, ReportSection, periodText, useReportParams } from '../../../../components/report/report-layout';
import { formatQuantity } from '../../../../components/report/report-format';
import { minorUnitsToDecimalString } from '../../../../lib/money';
import { downloadXlsx } from '../../../../lib/xlsx';
import { ALL_WAREHOUSES, WarehouseFilter } from './warehouse-filter';

const VIEWS = ['best', 'slow', 'all'] as const;
type View = (typeof VIEWS)[number];
const DAY_MS = 86_400_000;

function optionsText(row: MovementAnalysisRowDto): string {
  return Object.values(row.attributeValues ?? {})
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .map(String)
    .join(' / ');
}

/** Whole days between two YYYY-MM-DD dates (b − a). */
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / DAY_MS);
}

/**
 * حركة الأصناف — best sellers (by quantity sold in the period) and slow movers (stock on hand that
 * did not sell in the period, oldest last sale first), with days of cover at the period's pace.
 */
export function MovementAnalysisPage() {
  const { t } = useTranslation();
  const params = useReportParams({ preset: 'thisQuarter' });
  const rawView = params.get('view');
  const view: View = VIEWS.includes(rawView as View) ? (rawView as View) : 'best';
  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSES);
  const categoryId = params.get('category') ?? undefined;
  const { options: categoryOptions } = useCategoryOptions();
  const { data: rows, isLoading } = useMovementAnalysis({
    from: params.from,
    to: params.to,
    warehouseId: warehouseId === ALL_WAREHOUSES ? undefined : warehouseId,
    categoryId,
  });
  const periodDays = Math.max(1, daysBetween(params.from, params.to) + 1);
  const showCost = (rows ?? []).some((row) => row.stockValueMinorUnits !== null);

  const sorted = useMemo(() => {
    const all = rows ?? [];
    if (view === 'best') return all.filter((r) => r.soldQuantity > 0).sort((a, b) => b.soldQuantity - a.soldQuantity);
    if (view === 'slow') {
      return all
        .filter((r) => r.onHand > 0 && r.soldQuantity <= 0)
        .sort((a, b) => (a.lastSaleDate ?? '0000') .localeCompare(b.lastSaleDate ?? '0000') || b.onHand - a.onHand);
    }
    return [...all].sort((a, b) => b.soldQuantity - a.soldQuantity);
  }, [rows, view]);

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      best: all.filter((r) => r.soldQuantity > 0).length,
      slow: all.filter((r) => r.onHand > 0 && r.soldQuantity <= 0).length,
      all: all.length,
    };
  }, [rows]);

  const slowValue = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => r.onHand > 0 && r.soldQuantity <= 0)
        .reduce((sum, r) => sum + BigInt(r.stockValueMinorUnits ?? '0'), 0n),
    [rows],
  );

  /** Days the stock lasts at the period's selling pace; null when nothing sold. */
  const coverDays = (row: MovementAnalysisRowDto) =>
    row.soldQuantity > 0 && row.onHand > 0 ? Math.round(row.onHand / (row.soldQuantity / periodDays)) : null;
  const sinceLastSale = (row: MovementAnalysisRowDto) => (row.lastSaleDate ? daysBetween(row.lastSaleDate, params.to) : null);

  function exportXlsx() {
    const money = (v: string | null) => (v === null ? '' : Number(minorUnitsToDecimalString(v)));
    downloadXlsx(
      `${t('inventory.movementAnalysis.title')} ${params.from} ${params.to}`,
      [
        t('inventory.counts.csv.code'),
        t('inventory.counts.csv.product'),
        t('inventory.movementAnalysis.options'),
        t('inventory.products.category'),
        t('inventory.movementAnalysis.sold'),
        t('inventory.movementAnalysis.received'),
        t('inventory.movementAnalysis.onHand'),
        ...(showCost ? [t('inventory.movementAnalysis.stockValue'), t('inventory.movementAnalysis.soldCost')] : []),
        t('inventory.movementAnalysis.lastSale'),
        t('inventory.movementAnalysis.coverDays'),
      ],
      sorted.map((row) => [
        row.sku,
        row.productName,
        optionsText(row),
        row.categoryName ?? '',
        row.soldQuantity,
        row.receivedQuantity,
        row.onHand,
        ...(showCost ? [money(row.stockValueMinorUnits), money(row.soldCostMinorUnits)] : []),
        row.lastSaleDate ?? '',
        coverDays(row) ?? '',
      ]),
    );
  }

  return (
    <div className="grid gap-5">
      <PageHeader title={t('inventory.movementAnalysis.title')} description={t('inventory.movementAnalysis.description')} />
      <ReportFrame
        title={`${t('inventory.movementAnalysis.title')} — ${t(`inventory.movementAnalysis.views.${view}`)}`}
        period={periodText(t, params.from, params.to)}
        loading={isLoading}
        onExport={rows ? exportXlsx : undefined}
        filters={
          <>
            <PeriodPicker from={params.from} to={params.to} onChange={(range) => params.set(range)} />
            <WarehouseFilter value={warehouseId} onChange={setWarehouseId} />
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">{t('inventory.products.category')}</span>
              <div className="flex items-center gap-1">
                <Combobox
                  items={categoryOptions}
                  value={categoryId ?? null}
                  onValueChange={(id) => params.set({ category: id })}
                  getValue={(option) => option.id}
                  getLabel={(option) => option.path}
                  placeholder={t('inventory.products.allCategories')}
                  searchPlaceholder={t('common.search')}
                  emptyText={t('common.noResults')}
                  className="h-9 w-56"
                />
                {categoryId ? (
                  <Button variant="ghost" size="sm" onClick={() => params.set({ category: null })}>
                    {t('inventory.stock.clearFilters')}
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        }
      >
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <StatusTabs
              tabs={VIEWS}
              value={view}
              onChange={(tab) => params.set({ view: tab === 'best' ? null : tab })}
              label={(tab) => t(`inventory.movementAnalysis.views.${tab}`)}
              counts={rows ? counts : undefined}
            />
            {view === 'slow' && showCost && slowValue > 0n ? (
              <span className="text-sm text-muted-foreground">
                {t('inventory.movementAnalysis.slowValue')}: <Amount value={slowValue.toString()} className="font-semibold text-foreground" />
              </span>
            ) : null}
          </div>
          <ReportSection>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>{t('inventory.counts.csv.product')}</TableHead>
                  <TableHead className={AMOUNT_CELL}>{t('inventory.movementAnalysis.sold')}</TableHead>
                  <TableHead className={AMOUNT_CELL}>{t('inventory.movementAnalysis.received')}</TableHead>
                  <TableHead className={AMOUNT_CELL}>{t('inventory.movementAnalysis.onHand')}</TableHead>
                  {showCost ? <TableHead className={AMOUNT_CELL}>{t('inventory.movementAnalysis.stockValue')}</TableHead> : null}
                  <TableHead>{t('inventory.movementAnalysis.lastSale')}</TableHead>
                  <TableHead className={AMOUNT_CELL}>{t('inventory.movementAnalysis.coverDays')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row, index) => {
                  const since = sinceLastSale(row);
                  const cover = coverDays(row);
                  return (
                    <TableRow key={row.productVariantId}>
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      <TableCell>
                        <Link className="font-medium hover:underline" to={`/inventory/products/${row.productId}`}>
                          {row.productName}
                        </Link>
                        {optionsText(row) ? <span className="ms-2 text-sm font-semibold">{optionsText(row)}</span> : null}
                        <div className="text-xs text-muted-foreground">
                          <span dir="ltr">{row.sku}</span>
                          {row.categoryName ? ` · ${row.categoryName}` : ''}
                        </div>
                      </TableCell>
                      <TableCell className={`${AMOUNT_CELL} font-semibold`}>{formatQuantity(row.soldQuantity)}</TableCell>
                      <TableCell className={AMOUNT_CELL}>{formatQuantity(row.receivedQuantity)}</TableCell>
                      <TableCell className={`${AMOUNT_CELL} ${row.onHand <= 0 ? 'text-danger' : ''}`}>{formatQuantity(row.onHand)}</TableCell>
                      {showCost ? (
                        <TableCell className={AMOUNT_CELL}>
                          <Amount value={row.stockValueMinorUnits} hideCurrency zeroAsDash />
                        </TableCell>
                      ) : null}
                      <TableCell>
                        {row.lastSaleDate ? (
                          <span className="flex items-center gap-2">
                            <span className="tabular-nums">{row.lastSaleDate}</span>
                            {since !== null && since > 60 ? (
                              <Badge variant="warning">{t('inventory.movementAnalysis.daysAgo', { count: since })}</Badge>
                            ) : null}
                          </span>
                        ) : (
                          <Badge variant="neutral">{t('inventory.movementAnalysis.neverSold')}</Badge>
                        )}
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        {cover === null ? '—' : (
                          <span className={cover < 14 ? 'font-semibold text-danger' : cover > 180 ? 'text-warning' : ''}>{cover}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!isLoading && sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showCost ? 8 : 7} className="py-10 text-center text-muted-foreground">
                      {t('inventory.movementAnalysis.empty')}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </ReportSection>
          <p className="text-xs text-muted-foreground">{t('inventory.movementAnalysis.note')}</p>
        </div>
      </ReportFrame>
    </div>
  );
}
