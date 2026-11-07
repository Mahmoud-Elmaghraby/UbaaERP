import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@erp-platform/ui';
import { History } from 'lucide-react';

import { useVariantLookupMap } from '../../inventory/api/products/queries';
import { usePurchasePriceHistory } from '../api/purchase-reports/queries';
import { Amount } from '../../../components/amount';
import { findUnit } from '../../../components/product/variant-search';
import { formatDate } from '../../../lib/format-date';
import { minorUnitsToDecimalString, multiplyMinorUnits } from '../../../lib/money';

/**
 * Under a purchase line's price: the last price paid for the item (from this supplier when there
 * is one, else from anyone), converted to the line's unit — click to use it — and a popover with
 * the recent purchase history. Prices in another currency are shown but can't be applied.
 */
export function LastPurchasePrice({
  productVariantId,
  unitOfMeasureId,
  supplierId,
  currency,
  onUse,
}: {
  productVariantId: string;
  unitOfMeasureId: string | null;
  supplierId: string | null | undefined;
  currency: string;
  onUse: (price: string) => void;
}) {
  const { t } = useTranslation();
  const { data } = usePurchasePriceHistory(productVariantId, supplierId);
  const variants = useVariantLookupMap();
  const factor = findUnit(variants.get(productVariantId), unitOfMeasureId)?.factor ?? 1;
  if (!data || data.entries.length === 0) return null;

  const last = data.lastFromSupplier ?? data.entries[0]!;
  const inLineUnit = (perBase: string) => multiplyMinorUnits(perBase, String(factor));
  const usable = last.currency === currency;

  return (
    <div className="mt-1 flex items-center gap-1 text-[11px] leading-tight text-muted-foreground">
      <button
        type="button"
        className="truncate text-start hover:text-primary hover:underline disabled:no-underline"
        disabled={!usable}
        title={usable ? t('purchases.priceHistory.use') : undefined}
        onClick={() => onUse(minorUnitsToDecimalString(inLineUnit(last.unitPriceMinorUnits)))}
      >
        {t(data.lastFromSupplier ? 'purchases.priceHistory.lastFromSupplier' : 'purchases.priceHistory.last')}{' '}
        <Amount value={inLineUnit(last.unitPriceMinorUnits)} currency={usable ? undefined : last.currency} hideCurrency={usable} />
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="shrink-0 rounded p-0.5 hover:bg-muted" aria-label={t('purchases.priceHistory.title')}>
            <History className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <p className="border-b px-3 py-2 text-sm font-semibold">{t('purchases.priceHistory.title')}</p>
          <ul className="max-h-64 divide-y overflow-y-auto text-sm">
            {data.entries.map((entry) => (
              <li key={`${entry.purchaseInvoiceId}-${entry.unitPriceMinorUnits}`} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{entry.supplierName}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatDate(entry.date)} · {entry.invoiceNumber}
                  </span>
                </span>
                <Amount value={inLineUnit(entry.unitPriceMinorUnits)} currency={entry.currency} />
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
