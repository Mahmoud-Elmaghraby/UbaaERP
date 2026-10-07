import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Download, Scale } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { useStockValuation } from '../../api/reports/queries';
import { useInTransitValue } from '../../api/stock-documents/queries';
import { downloadCsv } from '../../../../lib/csv';
import { formatAmount, sumMinorUnits } from '../../../../lib/money';
import { normalizeForSearch } from '../../../../lib/search-normalize';
import { ALL_WAREHOUSES, WarehouseFilter } from './warehouse-filter';

/** تقييم المخزون: quantity × weighted-average cost per item and warehouse, with the total. */
export function ValuationPage() {
  const { t } = useTranslation();
  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSES);
  const [search, setSearch] = useState('');
  const { data, isLoading } = useStockValuation(warehouseId === ALL_WAREHOUSES ? undefined : warehouseId);

  const rows = useMemo(() => {
    const needle = normalizeForSearch(search);
    return (data ?? []).filter(
      (row) => !needle || normalizeForSearch(`${row.productName} ${row.sku} ${row.productCode}`).includes(needle),
    );
  }, [data, search]);
  const total = sumMinorUnits(rows.map((row) => row.value.amountMinorUnits));
  // Goods dispatched to a warehouse but not received yet — part of stock value, not on any shelf.
  const { data: inTransit } = useInTransitValue();
  const inTransitTotal = sumMinorUnits(
    (inTransit ?? [])
      .filter((row) => warehouseId === ALL_WAREHOUSES || row.toWarehouseId === warehouseId)
      .map((row) => row.value.amountMinorUnits),
  );
  const averageOf = (row: (typeof rows)[number]) =>
    row.quantity > 0 ? (BigInt(row.value.amountMinorUnits) * 10_000n) / BigInt(Math.round(row.quantity * 10_000)) : 0n;

  function exportCsv() {
    downloadCsv(
      t('inventory.valuation.title'),
      [
        t('inventory.counts.csv.code'),
        t('inventory.counts.csv.product'),
        t('documents.warehouse'),
        t('documents.quantity'),
        t('inventory.valuation.averageCost'),
        t('inventory.valuation.value'),
      ],
      [
        ...rows.map((row) => [
          row.sku,
          row.productName,
          row.warehouseName,
          row.quantity,
          formatAmount(averageOf(row).toString()),
          formatAmount(row.value.amountMinorUnits),
        ]),
        ['', t('documents.total'), '', '', '', formatAmount(total)],
      ],
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('inventory.valuation.title')}
        description={t('inventory.valuation.description')}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download />
            {t('inventory.reports.exportCsv')}
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <WarehouseFilter value={warehouseId} onChange={setWarehouseId} />
        <Input
          className="w-64"
          placeholder={t('inventory.reports.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="ms-auto flex flex-wrap items-baseline gap-4 text-sm">
          {inTransitTotal !== '0' ? (
            <Link to="/inventory/transfers?status=in_transit" className="text-muted-foreground hover:underline">
              {t('inventory.valuation.inTransit')}: <span className="font-semibold">{formatAmount(inTransitTotal)}</span>
            </Link>
          ) : null}
          <span>
            {t('inventory.valuation.total')}: <span className="text-lg font-bold">{formatAmount(total)}</span>
          </span>
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="m-5 h-40" />
          ) : rows.length === 0 ? (
            <EmptyState className="py-12" icon={<Scale />} title={t('inventory.valuation.empty')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inventory.counts.csv.product')}</TableHead>
                  <TableHead>{t('documents.warehouse')}</TableHead>
                  <TableHead className="text-end">{t('documents.quantity')}</TableHead>
                  <TableHead className="text-end">{t('inventory.valuation.averageCost')}</TableHead>
                  <TableHead className="text-end">{t('inventory.valuation.value')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.productVariantId}-${row.warehouseId}`}>
                    <TableCell>
                      <Link
                        className="font-medium hover:underline"
                        to={`/inventory/item-card?variant=${row.productVariantId}`}
                      >
                        {row.productName}
                      </Link>
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {row.sku}
                      </div>
                    </TableCell>
                    <TableCell>{row.warehouseName}</TableCell>
                    <TableCell className="text-end">{row.quantity}</TableCell>
                    <TableCell className="text-end">{formatAmount(averageOf(row).toString())}</TableCell>
                    <TableCell className="text-end font-medium">{formatAmount(row.value.amountMinorUnits)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
