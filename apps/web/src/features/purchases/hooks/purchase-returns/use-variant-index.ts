import { useMemo } from 'react';

import { useProductsWithVariants } from '../../../inventory/api/products/queries';

/** Same per-entity lookup-hook pattern as every other Purchases entity's own
 * use-variant-index.ts — see purchase-requisitions/use-variant-index.ts for the full
 * rationale (read-only cross-module reference data, CLAUDE.md §2.6 doesn't apply). */
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
