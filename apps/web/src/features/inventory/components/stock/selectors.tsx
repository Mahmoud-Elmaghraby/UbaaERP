import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { ProductVariantPicker } from '../../../../components/product/product-variant-picker';
import { useWarehouseLocations, useWarehouses } from '../../api/warehouses/queries';

/** Searchable product picker (name / SKU / code / barcode) — one control instead of the
 * old product → variant cascade. Plain controlled component (not a react-hook-form field)
 * so it can be reused identically as a filter and inside the movement/transfer forms.
 * Picking a variant reports both its product and its own id. */
export function ProductVariantSelector({
  variantId,
  onProductChange,
  onVariantChange,
  activeOnly = true,
}: {
  /** Kept for call-site compatibility; the picker derives the product from the variant. */
  productId?: string | undefined;
  variantId: string | undefined;
  onProductChange: (id: string | undefined) => void;
  onVariantChange: (id: string | undefined) => void;
  /** Filters should also find inactive items (history); forms should not. */
  activeOnly?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium">{t('inventory.stock.product')}</label>
      <ProductVariantPicker
        value={variantId}
        activeOnly={activeOnly}
        onChange={(id, variant) => {
          onProductChange(variant.productId);
          onVariantChange(id);
        }}
      />
    </div>
  );
}

/** Cascading warehouse -> location picker, same rationale as ProductVariantSelector. */
export function WarehouseLocationSelector({
  warehouseId,
  locationId,
  onWarehouseChange,
  onLocationChange,
}: {
  warehouseId: string | undefined;
  locationId: string | undefined;
  onWarehouseChange: (id: string | undefined) => void;
  onLocationChange: (id: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const { data: warehouses } = useWarehouses();
  const { data: locations } = useWarehouseLocations(warehouseId);

  return (
    <>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{t('inventory.stock.warehouse')}</label>
        <Select value={warehouseId} onValueChange={onWarehouseChange}>
          <SelectTrigger>
            <SelectValue placeholder={t('inventory.stock.selectWarehouse')} />
          </SelectTrigger>
          <SelectContent>
            {(warehouses ?? []).map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{t('inventory.stock.location')}</label>
        <Select value={locationId} onValueChange={onLocationChange} disabled={!warehouseId}>
          <SelectTrigger>
            <SelectValue placeholder={t('inventory.stock.selectLocation')} />
          </SelectTrigger>
          <SelectContent>
            {(locations ?? []).map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
