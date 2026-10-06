import type { ProductVariantLookupDto } from '@erp-platform/contracts';

import { normalizeForSearch } from '../../lib/search-normalize';

/** The text a variant is shown as in pickers: name, plus its options when it has any. */
export function variantDisplayName(variant: ProductVariantLookupDto): string {
  const options = Object.values(variant.attributeValues ?? {})
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .map(String);
  return options.length > 0 ? `${variant.productName} — ${options.join(' / ')}` : variant.productName;
}

/**
 * Ranks catalogue rows for a query: an exact barcode / SKU / product code
 * match first (so scanning a barcode then Enter picks the right item), then
 * codes that start with the query, then names containing every typed word.
 */
export function searchVariants(variants: readonly ProductVariantLookupDto[], query: string): ProductVariantLookupDto[] {
  const needle = normalizeForSearch(query);
  if (!needle) return variants.slice();
  const words = needle.split(' ');
  const ranked: { variant: ProductVariantLookupDto; rank: number }[] = [];

  for (const variant of variants) {
    const codes = [variant.barcode ?? '', variant.sku, variant.productCode].map(normalizeForSearch);
    let rank: number | null = null;
    if (codes.some((code) => code !== '' && code === needle)) rank = 0;
    else if (codes.some((code) => code !== '' && code.startsWith(needle))) rank = 1;
    else {
      const haystack = normalizeForSearch(`${variantDisplayName(variant)} ${codes.join(' ')}`);
      if (words.every((word) => haystack.includes(word))) rank = 2;
    }
    if (rank !== null) ranked.push({ variant, rank });
  }

  return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.variant);
}

/** Exact barcode/SKU/code match, for scanner input outside a picker (e.g. POS). */
export function findVariantByCode(
  variants: readonly ProductVariantLookupDto[],
  code: string,
): ProductVariantLookupDto | undefined {
  const needle = normalizeForSearch(code);
  if (!needle) return undefined;
  return (
    variants.find((variant) => variant.barcode && normalizeForSearch(variant.barcode) === needle) ??
    variants.find((variant) => normalizeForSearch(variant.sku) === needle) ??
    variants.find((variant) => normalizeForSearch(variant.productCode) === needle)
  );
}
