import { useMemo } from 'react';

import { useVariantLookup } from '../../features/inventory/api/products/queries';
import { variantDisplayName } from './variant-search';

export interface VariantIndexEntry {
  productId: string;
  productName: string;
  sku: string;
  trackingType: 'none' | 'lot' | 'serial';
}

/**
 * The one variant lookup for document screens (sales, purchases, inventory): id → display name,
 * SKU and tracking type. Read-only reference data from Inventory's catalogue query, so the
 * Event Bus rule (CLAUDE.md §2.6) doesn't apply. Replaces the per-entity copies that used to
 * live under each feature's hooks/<entity>/use-variant-index.ts.
 */
export function useVariantIndex() {
  const { data } = useVariantLookup();
  return useMemo(() => {
    const map = new Map<string, VariantIndexEntry>();
    for (const variant of data ?? []) {
      map.set(variant.id, {
        productId: variant.productId,
        productName: variantDisplayName(variant),
        sku: variant.sku,
        trackingType: variant.trackingType,
      });
    }
    return map;
  }, [data]);
}
