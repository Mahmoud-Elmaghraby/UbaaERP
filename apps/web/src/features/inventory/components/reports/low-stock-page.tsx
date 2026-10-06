import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BellRing, Download } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { useLowStock } from '../../api/reports/queries';
import { downloadCsv } from '../../../../lib/csv';
import { ALL_WAREHOUSES, WarehouseFilter } from './warehouse-filter';

/** الأصناف تحت حد الطلب: stock at or below its reorder point — the reorder list for purchasing. */
export function LowStockPage() {
  const { t } = useTranslation();
  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSES);
  const { data: rows, isLoading } = useLowStock(warehouseId === ALL_WAREHOUSES ? undefined : warehouseId);

  function exportCsv() {
    downloadCsv(
      t('inventory.lowStock.title'),
      [
        t('inventory.counts.csv.code'),
        t('inventory.counts.csv.product'),
        t('documents.warehouse'),
        t('inventory.lowStock.onHand'),
        t('inventory.lowStock.reorderPoint'),
        t('inventory.lowStock.shortage'),
      ],
      (rows ?? []).map((row) => [
        row.sku,
        row.productName,
        row.warehouseName,
        row.quantity,
        row.reorderPoint,
        Math.max(0, row.reorderPoint - row.quantity),
      ]),
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('inventory.lowStock.title')}
        description={t('inventory.lowStock.description')}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!rows?.length}>
            <Download />
            {t('inventory.reports.exportCsv')}
          </Button>
        }
      />
      <WarehouseFilter value={warehouseId} onChange={setWarehouseId} />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="m-5 h-40" />
          ) : !rows?.length ? (
            <EmptyState className="py-12" icon={<BellRing />} title={t('inventory.lowStock.empty')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inventory.counts.csv.product')}</TableHead>
                  <TableHead>{t('documents.warehouse')}</TableHead>
                  <TableHead className="text-end">{t('inventory.lowStock.onHand')}</TableHead>
                  <TableHead className="text-end">{t('inventory.lowStock.reorderPoint')}</TableHead>
                  <TableHead>{t('inventory.lowStock.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.productVariantId}-${row.locationId}`}>
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
                    <TableCell className="text-end">{row.reorderPoint}</TableCell>
                    <TableCell>
                      {row.quantity <= 0 ? (
                        <Badge variant="danger" dot>
                          {t('inventory.lowStock.out')}
                        </Badge>
                      ) : (
                        <Badge variant="warning" dot>
                          {t('inventory.lowStock.low', { count: row.reorderPoint - row.quantity })}
                        </Badge>
                      )}
                    </TableCell>
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
