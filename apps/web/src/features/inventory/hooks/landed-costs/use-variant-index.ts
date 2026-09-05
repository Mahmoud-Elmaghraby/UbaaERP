import { useMemo } from 'react';

import { useProductsWithVariants } from '../../api/products/queries';

/** Not shared with hooks/stock (deliberate — each Inventory entity owns its own lookup hooks
 * rather than reaching across entity boundaries for what is otherwise identical logic). */
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
