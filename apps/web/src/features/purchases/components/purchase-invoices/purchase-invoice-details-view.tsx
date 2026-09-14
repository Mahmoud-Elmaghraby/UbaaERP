import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PurchaseInvoiceWithLinesDto } from '@erp-platform/contracts';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { AttachmentsPanel } from '../../../attachments/components/attachments-panel';
import { usePurchaseOrders } from '../../api/purchase-orders/queries';
import { useVariantIndex } from '../../hooks/purchase-invoices/use-variant-index';
import { formatMoney } from '../../../../lib/money';
import { PURCHASE_INVOICE_STATUS_VARIANT, purchaseInvoiceStatusLabelKey } from './purchase-invoice-status';

/** Read-only header + lines + total, same shape as PurchaseOrderDetailsView. totalAmount
 * is always server-computed (never stored), so it's rendered as-is via formatMoney()
 * rather than summed client-side from the lines also shown here. */
export function PurchaseInvoiceDetailsView({ invoice }: { invoice: PurchaseInvoiceWithLinesDto }) {
  const { t } = useTranslation();
  const { data: purchaseOrders } = usePurchaseOrders();
  const variantIndex = useVariantIndex();

  const poById = useMemo(() => new Map((purchaseOrders ?? []).map((po) => [po.id, po])), [purchaseOrders]);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseInvoices.invoiceNumber')}</p>
          <p className="font-medium">{invoice.invoiceNumber}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('common.status')}</p>
          <Badge variant={PURCHASE_INVOICE_STATUS_VARIANT[invoice.status]}>
            {t(purchaseInvoiceStatusLabelKey(invoice.status))}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseInvoices.purchaseOrder')}</p>
          <p className="font-medium">{poById.get(invoice.purchaseOrderId)?.poNumber ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseInvoices.supplierInvoiceNumber')}</p>
          <p className="font-medium">{invoice.supplierInvoiceNumber ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseInvoices.invoiceDate')}</p>
          <p className="font-medium">{invoice.invoiceDate ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseInvoices.dueDate')}</p>
          <p className="font-medium">{invoice.dueDate ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseInvoices.totalAmount')}</p>
          <p className="font-medium">
            {formatMoney(invoice.totalAmount.amountMinorUnits, invoice.totalAmount.currency)}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <p className="text-muted-foreground">{t('purchases.purchaseInvoices.notes')}</p>
          <p className="font-medium">{invoice.notes ?? '—'}</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('purchases.purchaseInvoices.lineProduct')}</TableHead>
            <TableHead>{t('purchases.purchaseInvoices.lineQuantityInvoiced')}</TableHead>
            <TableHead>{t('purchases.purchaseInvoices.lineUnitPrice')}</TableHead>
            <TableHead>{t('purchases.purchaseInvoices.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoice.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                {variantIndex.get(line.productVariantId)?.productName ?? '—'} (
                {variantIndex.get(line.productVariantId)?.sku ?? '—'})
              </TableCell>
              <TableCell>{line.quantityInvoiced}</TableCell>
              <TableCell>{formatMoney(line.unitPrice.amountMinorUnits, line.unitPrice.currency)}</TableCell>
              <TableCell>{line.notes ?? '—'}</TableCell>
            </TableRow>
          ))}
          {invoice.lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                {t('common.noResults')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      <AttachmentsPanel entityType="purchase_invoice" entityId={invoice.id} />
    </div>
  );
}
