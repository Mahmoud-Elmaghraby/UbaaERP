import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SalesOrderWithLinesDto } from '@erp-platform/contracts';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useCustomers } from '../../api/customers/queries';
import { useVariantIndex } from '../../hooks/sales-orders/use-variant-index';
import { formatMoney } from '../../../../lib/money';
import { SALES_ORDER_STATUS_VARIANT, salesOrderStatusLabelKey } from './sales-order-status';

/** Read-only header + lines + total, same shape as Quotations'/Purchase Orders' own
 * details views. totalAmount is always server-computed (SalesOrdersService.getById()
 * derives it from the lines on every read, never stored), so it's rendered as-is
 * rather than summed client-side. */
export function SalesOrderDetailsView({ order }: { order: SalesOrderWithLinesDto }) {
  const { t } = useTranslation();
  const { data: customers } = useCustomers();
  const variantIndex = useVariantIndex();

  const customerById = useMemo(() => new Map((customers ?? []).map((c) => [c.id, c])), [customers]);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">{t('sales.salesOrders.soNumber')}</p>
          <p className="font-medium">{order.soNumber}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('common.status')}</p>
          <Badge variant={SALES_ORDER_STATUS_VARIANT[order.status]}>
            {t(salesOrderStatusLabelKey(order.status))}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.salesOrders.customer')}</p>
          <p className="font-medium">{customerById.get(order.customerId)?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.salesOrders.totalAmount')}</p>
          <p className="font-medium">{formatMoney(order.totalAmount.amountMinorUnits, order.totalAmount.currency)}</p>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <p className="text-muted-foreground">{t('sales.salesOrders.notes')}</p>
          <p className="font-medium">{order.notes ?? '—'}</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('sales.salesOrders.lineProduct')}</TableHead>
            <TableHead>{t('sales.salesOrders.lineQuantity')}</TableHead>
            <TableHead>{t('sales.salesOrders.lineUnitPriceHeader')}</TableHead>
            <TableHead>{t('sales.salesOrders.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {order.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                {variantIndex.get(line.productVariantId)?.productName ?? '—'} (
                {variantIndex.get(line.productVariantId)?.sku ?? '—'})
              </TableCell>
              <TableCell>{line.quantity}</TableCell>
              <TableCell>{formatMoney(line.unitPrice.amountMinorUnits, line.unitPrice.currency)}</TableCell>
              <TableCell>{line.notes ?? '—'}</TableCell>
            </TableRow>
          ))}
          {order.lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                {t('common.noResults')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
