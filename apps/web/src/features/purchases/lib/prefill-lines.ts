import type { ProductVariantLookupDto } from '@erp-platform/contracts';

import { newDirectLine, type DirectLineDraft } from '../../../components/document/direct-lines-editor';
import type { SalePricer } from '../../../components/product/sale-pricing';

/** Items handed to a new purchase document from another screen (e.g. the low-stock list), in base units. */
export interface PrefillLine {
  productVariantId: string;
  quantity: number;
}

/** Router state for /purchases/purchase-orders/new and /purchases/purchase-invoices/new. */
export interface PurchasePrefillState {
  prefillLines?: PrefillLine[];
}

export function readPrefillLines(state: unknown): PrefillLine[] {
  const lines = (state as PurchasePrefillState | null)?.prefillLines;
  return Array.isArray(lines) ? lines.filter((l) => l && typeof l.productVariantId === 'string' && l.quantity > 0) : [];
}

/** Direct-line drafts for the handed-over items (base unit, price filled in later by `fillMissingPrices`). */
export function draftsFromPrefill(lines: PrefillLine[]): DirectLineDraft[] {
  return lines.map((line) => ({ ...newDirectLine(), productVariantId: line.productVariantId, quantity: String(line.quantity) }));
}

/** Gives every line with an item but no price its default price; the same array when nothing changed. */
export function fillMissingPrices(
  lines: DirectLineDraft[],
  variants: ReadonlyMap<string, ProductVariantLookupDto>,
  pricer: SalePricer,
): DirectLineDraft[] {
  let changed = false;
  const next = lines.map((line) => {
    if (!line.productVariantId || line.unitPrice.trim() !== '') return line;
    const variant = variants.get(line.productVariantId);
    if (!variant) return line;
    const price = pricer(variant, line.unitOfMeasureId, line.quantity);
    if (!price) return line;
    changed = true;
    return { ...line, unitPrice: price };
  });
  return changed ? next : lines;
}
