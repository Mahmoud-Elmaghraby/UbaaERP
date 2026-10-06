import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Combobox } from '@erp-platform/ui';
import type { ProductVariantLookupDto } from '@erp-platform/contracts';

import { useVariantLookup } from '../../features/inventory/api/products/queries';
import { searchVariants, variantDisplayName } from './variant-search';

export interface ProductVariantPickerProps {
  /** Selected variant id; '' / undefined = nothing selected. */
  value: string | undefined;
  onChange: (variantId: string, variant: ProductVariantLookupDto) => void;
  /** Hide inactive items/products from the list (the current value stays visible). Default true. */
  activeOnly?: boolean;
  /** Restrict the list further, e.g. to lot-tracked items. */
  filter?: (variant: ProductVariantLookupDto) => boolean;
  className?: string;
  disabled?: boolean;
}

/**
 * The one product picker for every document line and stock form: searches
 * name (Arabic-spelling tolerant), SKU, product code and barcode; an exact
 * code/barcode match ranks first so "scan + Enter" selects it.
 */
export function ProductVariantPicker({
  value,
  onChange,
  activeOnly = true,
  filter,
  className,
  disabled,
}: ProductVariantPickerProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useVariantLookup();

  const items = useMemo(
    () =>
      (data ?? []).filter(
        (variant) =>
          variant.id === value ||
          ((!activeOnly || (variant.isActive && variant.productIsActive)) && (!filter || filter(variant))),
      ),
    [data, value, activeOnly, filter],
  );

  return (
    <Combobox
      items={items}
      value={value || null}
      onValueChange={(id, variant) => onChange(id, variant)}
      getValue={(variant) => variant.id}
      getLabel={variantDisplayName}
      search={searchVariants}
      renderItem={(variant) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{variantDisplayName(variant)}</span>
          <span className="truncate text-xs text-muted-foreground" dir="ltr">
            {[variant.sku, variant.barcode].filter(Boolean).join(' · ')}
            {' · '}
            {variant.unitOfMeasureSymbol}
          </span>
        </div>
      )}
      placeholder={isLoading ? t('common.loading') : t('documents.selectProduct')}
      searchPlaceholder={t('inventory.picker.searchPlaceholder')}
      emptyText={t('inventory.picker.empty')}
      aria-label={t('documents.selectProduct')}
      className={className}
      disabled={disabled}
    />
  );
}
