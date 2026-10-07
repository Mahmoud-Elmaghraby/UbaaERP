import { useTranslation } from 'react-i18next';
import type { ProductVariantLookupDto } from '@erp-platform/contracts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { useVariantLookupMap } from '../../features/inventory/api/products/queries';
import { unitSymbol } from './variant-search';

const BASE = 'base';

/**
 * Unit picker for a document line (carton / piece / sack…). Renders nothing
 * for products without extra units — the base unit is then implied.
 */
export function LineUnitSelect({
  variant,
  value,
  onChange,
  className,
  disabled,
}: {
  variant: ProductVariantLookupDto | undefined;
  value: string | null | undefined;
  onChange: (unitOfMeasureId: string | null) => void;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  if (!variant || variant.units.length === 0) return null;
  return (
    <Select value={value ?? BASE} onValueChange={(next) => onChange(next === BASE ? null : next)} disabled={disabled}>
      <SelectTrigger className={className ?? 'h-8 w-full'} aria-label={t('documents.unit')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={BASE}>{variant.unitOfMeasureSymbol}</SelectItem>
        {variant.units.map((unit) => (
          <SelectItem key={unit.unitOfMeasureId} value={unit.unitOfMeasureId}>
            {unit.name} ({t('documents.unitOf', { factor: unit.factor, base: variant.unitOfMeasureSymbol })})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** "2 كرتونة" — a quantity with the line's unit symbol (base unit when the line has none). */
export function QuantityWithUnit({
  quantity,
  productVariantId,
  unitOfMeasureId,
}: {
  quantity: number;
  productVariantId: string;
  unitOfMeasureId?: string | null;
}) {
  const variants = useVariantLookupMap();
  const symbol = unitSymbol(variants.get(productVariantId), unitOfMeasureId);
  return (
    <span>
      {quantity}
      {symbol ? <span className="ms-1 text-xs text-muted-foreground">{symbol}</span> : null}
    </span>
  );
}
