import type { InventorySettingsDto, ProductVariantLookupDto } from '@erp-platform/contracts';

import { normalizeForSearch } from '../../lib/search-normalize';
import { minorUnitsToDecimalString } from '../../lib/money';

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
    const codes = [
      variant.barcode ?? '',
      variant.sku,
      variant.productCode,
      ...variant.extraBarcodes.map((extra) => extra.barcode),
    ].map(normalizeForSearch);
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

/** What one scan resolved to: the item, and how many base units it stands for. */
export interface ScanResult {
  variant: ProductVariantLookupDto;
  quantity: number;
  /** True when the quantity came from a weighing-scale barcode (weight or price embedded in it). */
  fromScale: boolean;
}

export type ScaleBarcodeSettings = Pick<
  InventorySettingsDto,
  'scaleBarcodeEnabled' | 'scaleBarcodePrefix' | 'scaleItemCodeLength' | 'scaleValueType' | 'scaleValueDecimals'
>;

const stripLeadingZeros = (value: string) => value.replace(/^0+(?=.)/, '');

/**
 * Weighing-scale EAN-13: [prefix][item code][weight or price][check digit].
 * The item code is matched against the product code or SKU (leading zeros
 * ignored, so scale PLU "00042" finds code "42"). A weight becomes the line
 * quantity directly; a price is divided by the item's sale price.
 */
function resolveScaleBarcode(
  variants: readonly ProductVariantLookupDto[],
  digits: string,
  scale: ScaleBarcodeSettings,
): ScanResult | undefined {
  if (!scale.scaleBarcodeEnabled || !/^\d{13}$/.test(digits) || !digits.startsWith(scale.scaleBarcodePrefix)) {
    return undefined;
  }
  const codeStart = scale.scaleBarcodePrefix.length;
  const itemCode = stripLeadingZeros(digits.slice(codeStart, codeStart + scale.scaleItemCodeLength));
  const value = Number(digits.slice(codeStart + scale.scaleItemCodeLength, 12)) / 10 ** scale.scaleValueDecimals;
  const variant = variants.find(
    (candidate) =>
      stripLeadingZeros(normalizeForSearch(candidate.productCode)) === itemCode ||
      stripLeadingZeros(normalizeForSearch(candidate.sku)) === itemCode,
  );
  if (!variant || !(value > 0)) return undefined;
  if (scale.scaleValueType === 'weight') return { variant, quantity: value, fromScale: true };
  const unitPrice = variant.salePrice ? Number(variant.salePrice.amountMinorUnits) / 100 : 0;
  if (!(unitPrice > 0)) return undefined;
  return { variant, quantity: Math.round((value / unitPrice) * 1000) / 1000, fromScale: true };
}

/**
 * Resolves scanner input (outside a picker, e.g. POS): primary barcode,
 * then extra/pack barcodes (a carton barcode → 12), then SKU / product
 * code, then — when enabled — a weighing-scale barcode.
 */
export function resolveScan(
  variants: readonly ProductVariantLookupDto[],
  code: string,
  scale?: ScaleBarcodeSettings | null,
): ScanResult | undefined {
  const needle = normalizeForSearch(code);
  if (!needle) return undefined;
  const primary = variants.find((variant) => variant.barcode && normalizeForSearch(variant.barcode) === needle);
  if (primary) return { variant: primary, quantity: 1, fromScale: false };
  for (const variant of variants) {
    const extra = variant.extraBarcodes.find((candidate) => normalizeForSearch(candidate.barcode) === needle);
    if (extra) return { variant, quantity: extra.quantity, fromScale: false };
  }
  const byCode =
    variants.find((variant) => normalizeForSearch(variant.sku) === needle) ??
    variants.find((variant) => normalizeForSearch(variant.productCode) === needle);
  if (byCode) return { variant: byCode, quantity: 1, fromScale: false };
  return scale ? resolveScaleBarcode(variants, needle, scale) : undefined;
}

/**
 * The item's default sale/purchase price as editable decimal text, when it is
 * set and in the document's currency — used to prefill a line's price the
 * moment a product is picked. Null means "leave the price for the user".
 */
export function defaultPriceText(
  variant: ProductVariantLookupDto,
  kind: 'sale' | 'purchase',
  currency: string,
): string | null {
  const price = kind === 'sale' ? variant.salePrice : variant.purchasePrice;
  if (!price || (currency && price.currency !== currency)) return null;
  return minorUnitsToDecimalString(price.amountMinorUnits);
}
