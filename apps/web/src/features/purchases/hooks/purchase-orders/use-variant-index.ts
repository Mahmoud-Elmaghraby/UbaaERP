import { useMemo } from 'react';

import { useProductsWithVariants } from '../../../inventory/api/products/queries';

/** Same per-entity lookup-hook pattern as purchase-requisitions/use-variant-index.ts and
 * rfqs/use-variant-index.ts — see the former's comment for the full rationale (read-only
 * cross-module reference data, not a business-behavior call, so CLAUDE.md §2.6 doesn't
 * apply). Duplicated per-entity rather than shared, matching the established convention. */
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
