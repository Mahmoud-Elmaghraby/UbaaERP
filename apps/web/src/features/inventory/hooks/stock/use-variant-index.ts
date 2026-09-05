import { useMemo } from 'react';

import { useProductsWithVariants } from '../../api/products/queries';

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
