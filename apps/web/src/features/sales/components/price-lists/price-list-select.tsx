import { useTranslation } from 'react-i18next';
import type { PriceListKindDto } from '@erp-platform/contracts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { usePriceLists } from '../../api/price-lists/queries';

const NORMAL = '__normal__';

/**
 * Picks the price list a document is priced from (sales or supplier lists). "Normal prices"
 * = no list. Only active lists in the document's currency are offered;
 * the current value stays visible even if it was deactivated meanwhile.
 */
export function PriceListSelect({
  value,
  onChange,
  currency,
  className,
  disabled,
  kind = 'sale',
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  currency: string;
  className?: string;
  disabled?: boolean;
  /** 'purchase' = supplier price lists. */
  kind?: PriceListKindDto;
}) {
  const { t } = useTranslation();
  const { data: lists } = usePriceLists(kind);
  const options = (lists ?? []).filter(
    (list) => list.id === value || (list.isActive && (!currency || list.currency === currency)),
  );

  return (
    <Select value={value ?? NORMAL} onValueChange={(id) => onChange(id === NORMAL ? null : id)} disabled={disabled}>
      <SelectTrigger className={className} aria-label={t('priceLists.field')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NORMAL}>{t('priceLists.normalPrices')}</SelectItem>
        {options.map((list) => (
          <SelectItem key={list.id} value={list.id}>
            {list.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
