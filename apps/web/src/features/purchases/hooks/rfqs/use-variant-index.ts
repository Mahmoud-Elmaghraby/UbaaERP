import { useMemo } from 'react';

import { useProductsWithVariants } from '../../../inventory/api/products/queries';

/** Same per-entity lookup-hook pattern as purchase-requisitions/use-variant-index.ts —
 * see that file's comment for the full rationale (read-only cross-module reference data,
 * not a business-behavior call, so CLAUDE.md §2.6 doesn't apply). RFQ lines and Supplier
 * Quotation lines both use this — quotations are nested under the RFQs feature folder,
 * not a separate routed entity, so they share this copy rather than getting their own. */
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
