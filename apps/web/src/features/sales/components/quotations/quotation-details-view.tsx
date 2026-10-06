import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuotationWithLinesDto } from '@erp-platform/contracts';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { useCustomers } from '../../api/customers/queries';
import { useVariantIndex } from '../../hooks/quotations/use-variant-index';
import { formatMoney } from '../../../../lib/money';
import { QUOTATION_STATUS_VARIANT, quotationStatusLabelKey } from './quotation-status';

/** Read-only header + lines + total, same shape as Purchase Orders' own details view.
 * totalAmount is always server-computed (QuotationsService.getById() derives it from
 * the lines on every read, never stored), so it's rendered as-is rather than summed
 * client-side. */
export function QuotationDetailsView({ quotation }: { quotation: QuotationWithLinesDto }) {
  const { t } = useTranslation();
  const { data: customers } = useCustomers();
  const variantIndex = useVariantIndex();

  const customerById = useMemo(() => new Map((customers ?? []).map((c) => [c.id, c])), [customers]);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">{t('sales.quotations.quotationNumber')}</p>
          <p className="font-medium">{quotation.quotationNumber}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('common.status')}</p>
          <Badge variant={QUOTATION_STATUS_VARIANT[quotation.status]} dot>
            {t(quotationStatusLabelKey(quotation.status))}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.quotations.customer')}</p>
          <p className="font-medium">{customerById.get(quotation.customerId)?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.quotations.validUntilDate')}</p>
          <p className="font-medium">{quotation.validUntilDate ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.quotations.totalAmount')}</p>
          <p className="font-medium">
            {formatMoney(quotation.totalAmount.amountMinorUnits, quotation.totalAmount.currency)}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <p className="text-muted-foreground">{t('sales.quotations.notes')}</p>
          <p className="font-medium">{quotation.notes ?? '—'}</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('sales.quotations.lineProduct')}</TableHead>
            <TableHead>{t('sales.quotations.lineQuantity')}</TableHead>
            <TableHead>{t('sales.quotations.lineUnitPriceHeader')}</TableHead>
            <TableHead>{t('sales.quotations.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotation.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                {variantIndex.get(line.productVariantId)?.productName ?? '—'} (
                {variantIndex.get(line.productVariantId)?.sku ?? '—'})
              </TableCell>
              <TableCell>{line.quantity}</TableCell>
              <TableCell>
                {formatMoney(line.unitPrice.amountMinorUnits, line.unitPrice.currency)}
              </TableCell>
              <TableCell>{line.notes ?? '—'}</TableCell>
            </TableRow>
          ))}
          {quotation.lines.length === 0 ? (
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
