import type { PriceListDto, ProductVariantLookupDto } from '@erp-platform/contracts';

import { decimalToMinorUnits, minorUnitsToDecimalString, multiplyMinorUnits } from '../../lib/money';
import { findUnit, unitPriceText } from './variant-search';

/**
 * The ONE place that decides a document line's default price — sales (quotations,
 * sales orders, invoices, POS) and purchases (orders, direct invoices, with supplier
 * price lists). Without a price list it is the item's
 * normal price (unitPriceText). With one, in this order:
 *   1. the list's fixed price for this variant, at the highest quantity
 *      break the line reaches;
 *   2. the list's fixed price for the whole product (any variant), same rule;
 *   3. the % of the product's category (or its nearest parent with a rule);
 *   4. the list's general % on the normal price (− discount, + markup);
 *   5. the normal price.
 * Breaks and list prices are in base units; a line in a carton converts
 * through the unit's factor. A list in another currency than the document
 * is ignored. Null = leave the price to the user.
 */
export type SalePricer = (
  variant: ProductVariantLookupDto | undefined,
  unitOfMeasureId: string | null | undefined,
  quantity: string,
) => string | null;

interface ItemBreak {
  minQuantity: number;
  priceMinor: string;
}

/** Breaks per key, highest first, so the first one the quantity reaches wins. */
function indexItems(list: PriceListDto): Map<string, ItemBreak[]> {
  const index = new Map<string, ItemBreak[]>();
  for (const item of list.items) {
    const key = item.productVariantId ? `v:${item.productVariantId}` : `p:${item.productId}`;
    const breaks = index.get(key) ?? [];
    breaks.push({ minQuantity: Number(item.minQuantity), priceMinor: item.priceAmountMinorUnits });
    index.set(key, breaks);
  }
  for (const breaks of index.values()) breaks.sort((a, b) => b.minQuantity - a.minQuantity);
  return index;
}

/** (100 + percent) / 100 as exact decimal text ("-12.5" → "0.8750", "15" → "1.1500"); null = no change. */
export function adjustFactor(adjustPercent: string | undefined): string | null {
  const text = (adjustPercent || '0').trim();
  const negative = text.startsWith('-');
  const basis = BigInt(decimalToMinorUnits(negative ? text.slice(1) : text, 2)) * (negative ? -1n : 1n); // percent × 100
  if (basis === 0n) return null;
  const keep = 10000n + basis;
  if (keep <= 0n) return '0';
  return `${keep / 10000n}.${(keep % 10000n).toString().padStart(4, '0')}`;
}

function toNumber(text: string): number {
  const value = Number(String(text).replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** `priceKind` picks the normal price lists fall back to: sale price (sales lists) or purchase price (supplier lists). */
export function buildSalePricer(
  list: PriceListDto | null | undefined,
  currency: string,
  priceKind: 'sale' | 'purchase' = 'sale',
): SalePricer {
  const active = list && list.isActive && (!currency || list.currency === currency) ? list : null;
  if (!active) return (variant, unitId) => unitPriceText(variant, unitId, priceKind, currency);

  const index = indexItems(active);
  const factor = adjustFactor(active.adjustPercent);
  const categoryFactors = new Map(Object.entries(active.categoryAdjust ?? {}).map(([id, pct]) => [id, adjustFactor(pct)]));

  return (variant, unitId, quantity) => {
    if (!variant) return null;
    const unitFactor = findUnit(variant, unitId)?.factor ?? 1;
    // An empty quantity counts as one unit.
    const baseQuantity = (toNumber(quantity) || 1) * unitFactor;
    for (const key of [`v:${variant.id}`, `p:${variant.productId}`]) {
      const hit = index.get(key)?.find((entry) => baseQuantity + 1e-9 >= entry.minQuantity);
      if (hit) return minorUnitsToDecimalString(multiplyMinorUnits(hit.priceMinor, String(unitFactor)));
    }
    const normal = unitPriceText(variant, unitId, priceKind, currency);
    const applied = variant.categoryId && categoryFactors.has(variant.categoryId) ? categoryFactors.get(variant.categoryId)! : factor;
    if (normal === null || applied === null) return normal;
    return minorUnitsToDecimalString(multiplyMinorUnits(decimalToMinorUnits(normal), applied));
  };
}

interface PricedLine {
  productVariantId: string | undefined;
  unitOfMeasureId: string | null;
  quantity: string;
  unitPrice: string;
}

/**
 * A line's price after its quantity, unit or price list changed: re-priced
 * only while it still holds the price the old context would have given
 * (or is empty) — a price the user typed is never overwritten.
 */
export function repricedValue(
  line: PricedLine,
  variants: ReadonlyMap<string, ProductVariantLookupDto>,
  before: { pricer: SalePricer; quantity?: string; unitOfMeasureId?: string | null },
  after: SalePricer,
  next: { quantity?: string; unitOfMeasureId?: string | null } = {},
): string | null {
  const variant = line.productVariantId ? variants.get(line.productVariantId) : undefined;
  if (!variant) return null;
  const oldPrice = before.pricer(variant, before.unitOfMeasureId ?? line.unitOfMeasureId, before.quantity ?? line.quantity);
  const current = line.unitPrice.trim();
  if (current !== '' && current !== oldPrice) return null;
  const newPrice = after(variant, next.unitOfMeasureId ?? line.unitOfMeasureId, next.quantity ?? line.quantity);
  return newPrice !== null && newPrice !== current ? newPrice : null;
}

/** Re-prices every auto-priced line when the document's price list changes. */
export function repriceLines<T extends PricedLine>(
  lines: T[],
  variants: ReadonlyMap<string, ProductVariantLookupDto>,
  before: SalePricer,
  after: SalePricer,
): T[] {
  let changed = false;
  const result = lines.map((line) => {
    const price = repricedValue(line, variants, { pricer: before }, after);
    if (price === null) return line;
    changed = true;
    return { ...line, unitPrice: price };
  });
  return changed ? result : lines;
}
