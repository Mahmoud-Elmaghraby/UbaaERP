import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PurchaseOrderWithLinesDto } from '@erp-platform/contracts';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { AttachmentsPanel } from '../../../attachments/components/attachments-panel';
import { useSuppliers } from '../../api/suppliers/queries';
import { useVariantIndex } from '../../hooks/purchase-orders/use-variant-index';
import { formatMoney } from '../../../../lib/money';
import {
  PURCHASE_ORDER_STATUS_VARIANT,
  purchaseOrderStatusLabelKey,
} from './purchase-order-status';
import { QuantityWithUnit } from '../../../../components/product/unit-select';

/** Read-only header + lines + total, same shape as PurchaseRequisitionDetailsView /
 * RfqDetailsView's own header sections. totalAmount is always server-computed
 * (PurchaseOrdersService.getById() derives it from the lines on every read, never
 * stored), so it's rendered as-is rather than summed client-side. */
export function PurchaseOrderDetailsView({ order }: { order: PurchaseOrderWithLinesDto }) {
  const { t } = useTranslation();
  const { data: suppliers } = useSuppliers();
  const variantIndex = useVariantIndex();

  const supplierById = useMemo(() => new Map((suppliers ?? []).map((s) => [s.id, s])), [suppliers]);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseOrders.poNumber')}</p>
          <p className="font-medium">{order.poNumber}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('common.status')}</p>
          <Badge variant={PURCHASE_ORDER_STATUS_VARIANT[order.status]} dot>
            {t(purchaseOrderStatusLabelKey(order.status))}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseOrders.supplier')}</p>
          <p className="font-medium">{supplierById.get(order.supplierId)?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">
            {t('purchases.purchaseOrders.expectedDeliveryDate')}
          </p>
          <p className="font-medium">{order.expectedDeliveryDate ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseOrders.totalAmount')}</p>
          <p className="font-medium">
            {formatMoney(order.totalAmount.amountMinorUnits, order.totalAmount.currency)}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <p className="text-muted-foreground">{t('purchases.purchaseOrders.notes')}</p>
          <p className="font-medium">{order.notes ?? '—'}</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('purchases.purchaseOrders.lineProduct')}</TableHead>
            <TableHead>{t('purchases.purchaseOrders.lineQuantity')}</TableHead>
            <TableHead>{t('purchases.purchaseOrders.lineUnitPriceHeader')}</TableHead>
            <TableHead>{t('purchases.purchaseOrders.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {order.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                {variantIndex.get(line.productVariantId)?.productName ?? '—'} (
                {variantIndex.get(line.productVariantId)?.sku ?? '—'})
              </TableCell>
              <TableCell><QuantityWithUnit quantity={line.quantity} productVariantId={line.productVariantId} unitOfMeasureId={line.unitOfMeasureId} /></TableCell>
              <TableCell>
                {formatMoney(line.unitPrice.amountMinorUnits, line.unitPrice.currency)}
              </TableCell>
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

      <AttachmentsPanel entityType="purchase_order" entityId={order.id} />
    </div>
  );
}
