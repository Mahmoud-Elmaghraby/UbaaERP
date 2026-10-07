import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { useExpiringLots } from '../../api/stock/queries';
import { useWarehouses } from '../../api/warehouses/queries';
import { formatAmount, multiplyMinorUnits, sumMinorUnits } from '../../../../lib/money';

const WINDOWS = [30, 60, 90, 180, 365] as const;
const ALL = 'all';

/**
 * Near-expiry report (تقرير الصلاحية): every lot on hand that has expired or
 * expires within the chosen window, soonest first, with its stock value at
 * lot cost — what a pharmacy, medical supplier or feed mill checks weekly to
 * push short-dated stock out or return it before it is written off.
 */
export function ExpiryReportPage() {
  const { t } = useTranslation();
  const [withinDays, setWithinDays] = useState<number>(90);
  const [warehouseId, setWarehouseId] = useState<string>(ALL);
  const { data, isLoading } = useExpiringLots(withinDays);
  const { data: warehouses } = useWarehouses();

  const rows = useMemo(
    () => (data ?? []).filter((row) => warehouseId === ALL || row.warehouseId === warehouseId),
    [data, warehouseId],
  );
  const expiredRows = rows.filter((row) => row.daysToExpiry < 0);
  const valueOf = (list: typeof rows) =>
    sumMinorUnits(
      list.map((row) => (row.unitCost ? multiplyMinorUnits(row.unitCost.amountMinorUnits, String(row.quantityOnHand)) : '0')),
    );

  return (
    <div className="grid gap-6">
      <PageHeader title={t('inventory.expiry.title')} description={t('inventory.expiry.description')} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t('inventory.expiry.window')}</span>
          <Select value={String(withinDays)} onValueChange={(value) => setWithinDays(Number(value))}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {t('inventory.expiry.withinDays', { count: days })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t('documents.warehouse')}</span>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('documents.all')}</SelectItem>
              {(warehouses ?? []).map((warehouse) => (
                <SelectItem key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {rows.length > 0 ? (
          <div className="ms-auto flex gap-4 text-sm">
            <span>
              {t('inventory.expiry.expiredValue')}:{' '}
              <span className="font-semibold text-destructive">{formatAmount(valueOf(expiredRows))}</span>
            </span>
            <span>
              {t('inventory.expiry.totalValue')}: <span className="font-semibold">{formatAmount(valueOf(rows))}</span>
            </span>
          </div>
        ) : null}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="m-5 h-40" />
          ) : rows.length === 0 ? (
            <EmptyState icon={<CalendarClock />} title={t('inventory.expiry.empty')} className="py-12" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inventory.expiry.product')}</TableHead>
                  <TableHead>{t('lots.lotNumber')}</TableHead>
                  <TableHead>{t('documents.warehouse')}</TableHead>
                  <TableHead>{t('lots.expiryDate')}</TableHead>
                  <TableHead>{t('inventory.expiry.status')}</TableHead>
                  <TableHead className="text-end">{t('documents.quantity')}</TableHead>
                  <TableHead className="text-end">{t('inventory.expiry.value')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.stockLotId}-${row.warehouseId}`}>
                    <TableCell>
                      <div className="font-medium">{row.productName}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {row.sku}
                      </div>
                    </TableCell>
                    <TableCell dir="ltr" className="text-end font-mono">
                      {row.lotNumber}
                    </TableCell>
                    <TableCell>{row.warehouseName}</TableCell>
                    <TableCell>{new Date(row.expiryDate).toLocaleDateString('en-CA')}</TableCell>
                    <TableCell>
                      {row.daysToExpiry < 0 ? (
                        <Badge variant="danger" dot>
                          {t('inventory.expiry.expiredAgo', { count: -row.daysToExpiry })}
                        </Badge>
                      ) : row.daysToExpiry <= 30 ? (
                        <Badge variant="warning" dot>
                          {t('inventory.expiry.daysLeft', { count: row.daysToExpiry })}
                        </Badge>
                      ) : (
                        <Badge variant="neutral">{t('inventory.expiry.daysLeft', { count: row.daysToExpiry })}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end">{row.quantityOnHand}</TableCell>
                    <TableCell className="text-end">
                      {row.unitCost
                        ? formatAmount(multiplyMinorUnits(row.unitCost.amountMinorUnits, String(row.quantityOnHand)))
                        : '—'}
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
