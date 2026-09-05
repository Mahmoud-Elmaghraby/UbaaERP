import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { useProduct, useProducts } from '../../api/products/queries';
import { useWarehouseLocations, useWarehouses } from '../../api/warehouses/queries';

/** Cascading product -> variant picker. Plain controlled component (not a react-hook-form
 * field) so it can be reused identically as a filter and inside the movement/transfer forms,
 * which manage their own state rather than routing dynamic selects through a Zod resolver. */
export function ProductVariantSelector({
  productId,
  variantId,
  onProductChange,
  onVariantChange,
}: {
  productId: string | undefined;
  variantId: string | undefined;
  onProductChange: (id: string | undefined) => void;
  onVariantChange: (id: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const { data: products } = useProducts();
  const { data: productDetail } = useProduct(productId);

  return (
    <>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{t('inventory.stock.product')}</label>
        <Select value={productId} onValueChange={onProductChange}>
          <SelectTrigger>
            <SelectValue placeholder={t('inventory.stock.selectProduct')} />
          </SelectTrigger>
          <SelectContent>
            {(products ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{t('inventory.stock.variant')}</label>
        <Select value={variantId} onValueChange={onVariantChange} disabled={!productDetail}>
          <SelectTrigger>
            <SelectValue placeholder={t('inventory.stock.selectVariant')} />
          </SelectTrigger>
          <SelectContent>
            {(productDetail?.variants ?? []).map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.sku}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
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
