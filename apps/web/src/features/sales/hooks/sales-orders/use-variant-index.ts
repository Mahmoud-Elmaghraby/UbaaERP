import { useMemo } from 'react';

import { useVariantLookup } from '../../../inventory/api/products/queries';
import { variantDisplayName } from '../../../../components/product/variant-search';

/** Same per-entity lookup-hook pattern as every other Sales/Purchases entity's own
 * use-variant-index.ts — see purchases/hooks/purchase-requisitions/use-variant-index.ts
 * for the full rationale (read-only cross-module reference data, CLAUDE.md §2.6 doesn't
 * apply). Duplicated per-entity rather than shared, matching the established convention. */
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
