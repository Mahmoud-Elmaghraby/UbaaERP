import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SalesInvoiceWithLinesDto } from '@erp-platform/contracts';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useSalesOrders } from '../../api/sales-orders/queries';
import { useVariantIndex } from '../../hooks/sales-invoices/use-variant-index';
import { formatMoney } from '../../../../lib/money';
import { SALES_INVOICE_STATUS_VARIANT, salesInvoiceStatusLabelKey } from './sales-invoice-status';

/** Read-only header + lines + total, same shape as PurchaseInvoiceDetailsView.
 * totalAmount is always server-computed (never stored), so it's rendered as-is via
 * formatMoney() rather than summed client-side from the lines also shown here. */
export function SalesInvoiceDetailsView({ invoice }: { invoice: SalesInvoiceWithLinesDto }) {
  const { t } = useTranslation();
  const { data: salesOrders } = useSalesOrders();
  const variantIndex = useVariantIndex();

  const soById = useMemo(() => new Map((salesOrders ?? []).map((so) => [so.id, so])), [salesOrders]);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">{t('sales.salesInvoices.invoiceNumber')}</p>
          <p className="font-medium">{invoice.invoiceNumber}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('common.status')}</p>
          <Badge variant={SALES_INVOICE_STATUS_VARIANT[invoice.status]}>
            {t(salesInvoiceStatusLabelKey(invoice.status))}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.salesInvoices.salesOrder')}</p>
          <p className="font-medium">{soById.get(invoice.salesOrderId)?.soNumber ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.salesInvoices.dueDate')}</p>
          <p className="font-medium">{invoice.dueDate ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.salesInvoices.invoiceDate')}</p>
          <p className="font-medium">{invoice.invoiceDate ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.salesInvoices.totalAmount')}</p>
          <p className="font-medium">
            {formatMoney(invoice.totalAmount.amountMinorUnits, invoice.totalAmount.currency)}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <p className="text-muted-foreground">{t('sales.salesInvoices.notes')}</p>
          <p className="font-medium">{invoice.notes ?? '—'}</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('sales.salesInvoices.lineProduct')}</TableHead>
            <TableHead>{t('sales.salesInvoices.lineQuantityInvoiced')}</TableHead>
            <TableHead>{t('sales.salesInvoices.lineUnitPrice')}</TableHead>
            <TableHead>{t('sales.salesInvoices.lineNotes')}</TableHead>
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
    </div>
  );
}
