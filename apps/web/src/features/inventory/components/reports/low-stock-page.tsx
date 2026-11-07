import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { BellRing, Download, ShoppingCart } from 'lucide-react';
import {
  Badge,
  Button,
  Can,
  Card,
  Checkbox,
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
  useHasFeature,
} from '@erp-platform/ui';

import { useLowStock } from '../../api/reports/queries';
import { downloadXlsx } from '../../../../lib/xlsx';
import { FEATURE_KEYS } from '../../../../lib/feature-keys';
import type { PurchasePrefillState } from '../../../purchases/lib/prefill-lines';
import { ALL_WAREHOUSES, WarehouseFilter } from './warehouse-filter';

/** الأصناف تحت حد الطلب: stock at or below its reorder point — the reorder list for purchasing. */
export function LowStockPage() {
  const { t } = useTranslation();
  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSES);
  const { data: rows, isLoading } = useLowStock(warehouseId === ALL_WAREHOUSES ? undefined : warehouseId);
  const navigate = useNavigate();
  const ordersEnabled = useHasFeature(FEATURE_KEYS.PURCHASES_PURCHASE_ORDERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rowKey = (row: { productVariantId: string; locationId: string }) => `${row.productVariantId}-${row.locationId}`;
  const allKeys = (rows ?? []).map(rowKey);
  const allSelected = allKeys.length > 0 && allKeys.every((key) => selected.has(key));

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Opens a new purchase order (or a direct purchase invoice when orders are off) with the chosen items. */
  function orderSelected() {
    // What to buy per item: its shortage below the reorder point, summed over the selected warehouse rows.
    const shortage = new Map<string, number>();
    for (const row of rows ?? []) {
      if (!selected.has(rowKey(row))) continue;
      shortage.set(row.productVariantId, (shortage.get(row.productVariantId) ?? 0) + Math.max(0, row.reorderPoint - row.quantity));
    }
    const state: PurchasePrefillState = {
      prefillLines: [...shortage].map(([id, quantity]) => ({ productVariantId: id, quantity: Math.max(1, Math.ceil(quantity)) })),
    };
    navigate(ordersEnabled ? '/purchases/purchase-orders/new' : '/purchases/purchase-invoices/new', { state });
  }

  function exportCsv() {
    downloadXlsx(
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
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!rows?.length}>
              <Download />
              {t('inventory.reports.exportCsv')}
            </Button>
            <Can permission="purchases.manage">
              <Button onClick={orderSelected} disabled={selected.size === 0}>
                <ShoppingCart />
                {t('inventory.lowStock.createOrder', { count: selected.size })}
              </Button>
            </Can>
          </>
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
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label={t('inventory.lowStock.selectAll')}
                      checked={allSelected}
                      onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(allKeys))}
                    />
                  </TableHead>
                  <TableHead>{t('inventory.counts.csv.product')}</TableHead>
                  <TableHead>{t('documents.warehouse')}</TableHead>
                  <TableHead className="text-end">{t('inventory.lowStock.onHand')}</TableHead>
                  <TableHead className="text-end">{t('inventory.lowStock.reorderPoint')}</TableHead>
                  <TableHead>{t('inventory.lowStock.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={rowKey(row)}>
                    <TableCell>
                      <Checkbox
                        aria-label={row.productName}
                        checked={selected.has(rowKey(row))}
                        onCheckedChange={() => toggle(rowKey(row))}
                      />
                    </TableCell>
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
