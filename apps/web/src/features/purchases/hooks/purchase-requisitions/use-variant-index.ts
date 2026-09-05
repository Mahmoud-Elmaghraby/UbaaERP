import { useMemo } from 'react';

import { useProductsWithVariants } from '../../../inventory/api/products/queries';

/**
 * Same per-entity lookup-hook pattern Inventory uses (see
 * inventory/hooks/{landed-costs,stock}/use-variant-index.ts — "each entity
 * owns its own lookup hooks rather than reaching across entity boundaries").
 * Purchases has no product catalog of its own, so this reads Inventory's
 * product/variant query hook directly — a read-only reference-data lookup,
 * not a cross-module business-behavior call, so CLAUDE.md §2.6 (Event Bus
 * only, no direct module-to-module calls) does not apply here. Same
 * category as the backend's existing cross-module DB FK precedent
 * (goods_receipts.warehouse_id -> warehouses).
 */
export function useVariantIndex() {
  const { data: productsWithVariants } = useProductsWithVariants();
  return useMemo(() => {
    const map = new Map<string, { productName: string; sku: string }>();
    for (const product of productsWithVariants) {
      for (const variant of product.variants) {
        map.set(variant.id, { productName: product.name, sku: variant.sku });
      }
    }
    return map;
  }, [productsWithVariants]);
}
