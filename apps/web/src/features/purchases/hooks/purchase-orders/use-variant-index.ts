import { useMemo } from 'react';

import { useVariantLookup } from '../../../inventory/api/products/queries';
import { variantDisplayName } from '../../../../components/product/variant-search';

/** Same per-entity lookup-hook pattern as purchase-requisitions/use-variant-index.ts and
 * rfqs/use-variant-index.ts — see the former's comment for the full rationale (read-only
 * cross-module reference data, not a business-behavior call, so CLAUDE.md §2.6 doesn't
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
