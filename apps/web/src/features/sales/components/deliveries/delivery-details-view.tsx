import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeliveryWithLinesDto } from '@erp-platform/contracts';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { useWarehouses } from '../../../inventory/api/warehouses/queries';
import { useSalesOrders } from '../../api/sales-orders/queries';
import { useVariantIndex } from '../../hooks/deliveries/use-variant-index';
import { DELIVERY_STATUS_VARIANT, deliveryStatusLabelKey } from './delivery-status';

/** Read-only header + lines, same shape as every other Sales/Purchases entity's details
 * view. No Money column — deliveries carry no unit cost. */
export function DeliveryDetailsView({ delivery }: { delivery: DeliveryWithLinesDto }) {
  const { t } = useTranslation();
  const { data: salesOrders } = useSalesOrders();
  const { data: warehouses } = useWarehouses();
  const variantIndex = useVariantIndex();

  const soById = useMemo(
    () => new Map((salesOrders ?? []).map((so) => [so.id, so])),
    [salesOrders],
  );
  const warehouseById = useMemo(
    () => new Map((warehouses ?? []).map((w) => [w.id, w])),
    [warehouses],
  );

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">{t('sales.deliveries.deliveryNumber')}</p>
          <p className="font-medium">{delivery.deliveryNumber}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('common.status')}</p>
          <Badge variant={DELIVERY_STATUS_VARIANT[delivery.status]} dot>
            {t(deliveryStatusLabelKey(delivery.status))}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.deliveries.salesOrder')}</p>
          <p className="font-medium">{soById.get(delivery.salesOrderId)?.soNumber ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.deliveries.warehouse')}</p>
          <p className="font-medium">{warehouseById.get(delivery.warehouseId)?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.deliveries.deliveryDate')}</p>
          <p className="font-medium">{delivery.deliveryDate ?? '—'}</p>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <p className="text-muted-foreground">{t('sales.deliveries.notes')}</p>
          <p className="font-medium">{delivery.notes ?? '—'}</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('sales.deliveries.lineProduct')}</TableHead>
            <TableHead>{t('sales.deliveries.lineQuantityDelivered')}</TableHead>
            <TableHead>{t('sales.deliveries.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {delivery.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                {variantIndex.get(line.productVariantId)?.productName ?? '—'} (
                {variantIndex.get(line.productVariantId)?.sku ?? '—'})
              </TableCell>
              <TableCell>{line.quantityDelivered}</TableCell>
              <TableCell>{line.notes ?? '—'}</TableCell>
            </TableRow>
          ))}
          {delivery.lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                {t('common.noResults')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
