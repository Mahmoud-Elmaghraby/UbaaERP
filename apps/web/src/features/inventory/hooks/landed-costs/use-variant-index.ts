import { useMemo } from 'react';

import { useVariantLookup } from '../../api/products/queries';
import { variantDisplayName } from '../../../../components/product/variant-search';

/** Not shared with hooks/stock (deliberate — each Inventory entity owns its own lookup hooks
 * rather than reaching across entity boundaries for what is otherwise identical logic). */
export function useVariantIndex() {
  const { data } = useVariantLookup();
  return useMemo(() => {
    const map = new Map<string, { productName: string; sku: string }>();
    for (const variant of data ?? []) {
      map.set(variant.id, { productName: variantDisplayName(variant), sku: variant.sku });
    }
    return map;
  }, [data]);
}
