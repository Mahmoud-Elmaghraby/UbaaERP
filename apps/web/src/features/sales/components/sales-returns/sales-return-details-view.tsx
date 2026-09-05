import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SalesReturnWithLinesDto } from '@erp-platform/contracts';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useDeliveries } from '../../api/deliveries/queries';
import { useSalesCreditNotesBySalesReturn } from '../../api/sales-credit-notes/queries';
import { useVariantIndex } from '../../hooks/sales-returns/use-variant-index';
import { SALES_RETURN_STATUS_VARIANT, salesReturnStatusLabelKey } from './sales-return-status';

/** Read-only header + lines, same shape as every other Sales/Purchases entity's details
 * view. No Money column — sales returns carry no unit cost (see PurchaseReturns'
 * "not a financial debit note" precedent). */
export function SalesReturnDetailsView({ salesReturn }: { salesReturn: SalesReturnWithLinesDto }) {
  const { t } = useTranslation();
  const { data: deliveries } = useDeliveries();
  const variantIndex = useVariantIndex();
  // Only ever non-empty once the return is 'confirmed' — confirm() auto-generates
  // exactly one Sales Credit Note per return in the same transaction (migration 0053).
  const { data: creditNotes } = useSalesCreditNotesBySalesReturn(salesReturn.id);
  const creditNote = creditNotes?.[0] ?? null;

  const deliveryById = useMemo(() => new Map((deliveries ?? []).map((d) => [d.id, d])), [deliveries]);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">{t('sales.salesReturns.returnNumber')}</p>
          <p className="font-medium">{salesReturn.returnNumber}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('common.status')}</p>
          <Badge variant={SALES_RETURN_STATUS_VARIANT[salesReturn.status]}>
            {t(salesReturnStatusLabelKey(salesReturn.status))}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.salesReturns.delivery')}</p>
          <p className="font-medium">{deliveryById.get(salesReturn.deliveryId)?.deliveryNumber ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.salesReturns.returnDate')}</p>
          <p className="font-medium">{salesReturn.returnDate ?? '—'}</p>
        </div>
        {creditNote ? (
          <div>
            <p className="text-muted-foreground">{t('sales.salesReturns.creditNote')}</p>
            <p className="font-medium">{creditNote.creditNoteNumber}</p>
          </div>
        ) : null}
        <div className="col-span-2 sm:col-span-3">
          <p className="text-muted-foreground">{t('sales.salesReturns.notes')}</p>
          <p className="font-medium">{salesReturn.notes ?? '—'}</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('sales.salesReturns.lineProduct')}</TableHead>
            <TableHead>{t('sales.salesReturns.lineQuantityReturned')}</TableHead>
            <TableHead>{t('sales.salesReturns.lineReason')}</TableHead>
            <TableHead>{t('sales.salesReturns.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {salesReturn.lines.map((line) => (
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
          {salesReturn.lines.length === 0 ? (
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
