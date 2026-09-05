import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { GoodsReceiptWithLinesDto } from '@erp-platform/contracts';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useWarehouses } from '../../../inventory/api/warehouses/queries';
import { usePurchaseOrders } from '../../api/purchase-orders/queries';
import { useVariantIndex } from '../../hooks/goods-receipts/use-variant-index';
import { formatMoney } from '../../../../lib/money';
import { GOODS_RECEIPT_STATUS_VARIANT, goodsReceiptStatusLabelKey } from './goods-receipt-status';

/** Read-only header + lines, same shape as every other Purchases entity's details view. */
export function GoodsReceiptDetailsView({ receipt }: { receipt: GoodsReceiptWithLinesDto }) {
  const { t } = useTranslation();
  const { data: purchaseOrders } = usePurchaseOrders();
  const { data: warehouses } = useWarehouses();
  const variantIndex = useVariantIndex();

  const poById = useMemo(() => new Map((purchaseOrders ?? []).map((po) => [po.id, po])), [purchaseOrders]);
  const warehouseById = useMemo(() => new Map((warehouses ?? []).map((w) => [w.id, w])), [warehouses]);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">{t('purchases.goodsReceipts.receiptNumber')}</p>
          <p className="font-medium">{receipt.receiptNumber}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('common.status')}</p>
          <Badge variant={GOODS_RECEIPT_STATUS_VARIANT[receipt.status]}>
            {t(goodsReceiptStatusLabelKey(receipt.status))}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.goodsReceipts.purchaseOrder')}</p>
          <p className="font-medium">{poById.get(receipt.purchaseOrderId)?.poNumber ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.goodsReceipts.warehouse')}</p>
          <p className="font-medium">{warehouseById.get(receipt.warehouseId)?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.goodsReceipts.receivedDate')}</p>
          <p className="font-medium">{receipt.receivedDate ?? '—'}</p>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <p className="text-muted-foreground">{t('purchases.goodsReceipts.notes')}</p>
          <p className="font-medium">{receipt.notes ?? '—'}</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('purchases.goodsReceipts.lineProduct')}</TableHead>
            <TableHead>{t('purchases.goodsReceipts.lineQuantityReceived')}</TableHead>
            <TableHead>{t('purchases.goodsReceipts.lineUnitCost')}</TableHead>
            <TableHead>{t('purchases.goodsReceipts.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {receipt.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                {variantIndex.get(line.productVariantId)?.productName ?? '—'} (
                {variantIndex.get(line.productVariantId)?.sku ?? '—'})
              </TableCell>
              <TableCell>{line.quantityReceived}</TableCell>
              <TableCell>{formatMoney(line.unitCost.amountMinorUnits, line.unitCost.currency)}</TableCell>
              <TableCell>{line.notes ?? '—'}</TableCell>
            </TableRow>
          ))}
          {receipt.lines.length === 0 ? (
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
