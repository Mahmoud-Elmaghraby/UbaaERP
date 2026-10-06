import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PurchaseReturnWithLinesDto } from '@erp-platform/contracts';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { useGoodsReceipts } from '../../api/goods-receipts/queries';
import { useVariantIndex } from '../../hooks/purchase-returns/use-variant-index';
import {
  PURCHASE_RETURN_STATUS_VARIANT,
  purchaseReturnStatusLabelKey,
} from './purchase-return-status';

/** Read-only header + lines, same shape as every other Purchases entity's details view. */
export function PurchaseReturnDetailsView({
  purchaseReturn,
}: {
  purchaseReturn: PurchaseReturnWithLinesDto;
}) {
  const { t } = useTranslation();
  const { data: goodsReceipts } = useGoodsReceipts();
  const variantIndex = useVariantIndex();

  const receiptById = useMemo(
    () => new Map((goodsReceipts ?? []).map((r) => [r.id, r])),
    [goodsReceipts],
  );

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseReturns.returnNumber')}</p>
          <p className="font-medium">{purchaseReturn.returnNumber}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('common.status')}</p>
          <Badge variant={PURCHASE_RETURN_STATUS_VARIANT[purchaseReturn.status]} dot>
            {t(purchaseReturnStatusLabelKey(purchaseReturn.status))}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseReturns.goodsReceipt')}</p>
          <p className="font-medium">
            {receiptById.get(purchaseReturn.goodsReceiptId)?.receiptNumber ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseReturns.returnDate')}</p>
          <p className="font-medium">{purchaseReturn.returnDate ?? '—'}</p>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <p className="text-muted-foreground">{t('purchases.purchaseReturns.notes')}</p>
          <p className="font-medium">{purchaseReturn.notes ?? '—'}</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('purchases.purchaseReturns.lineProduct')}</TableHead>
            <TableHead>{t('purchases.purchaseReturns.lineQuantityReturned')}</TableHead>
            <TableHead>{t('purchases.purchaseReturns.lineReason')}</TableHead>
            <TableHead>{t('purchases.purchaseReturns.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchaseReturn.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                {variantIndex.get(line.productVariantId)?.productName ?? '—'} (
                {variantIndex.get(line.productVariantId)?.sku ?? '—'})
              </TableCell>
              <TableCell>{line.quantityReturned}</TableCell>
              <TableCell>{line.reason ?? '—'}</TableCell>
              <TableCell>{line.notes ?? '—'}</TableCell>
            </TableRow>
          ))}
          {purchaseReturn.lines.length === 0 ? (
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
