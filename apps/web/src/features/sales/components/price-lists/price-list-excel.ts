import type { ProductVariantLookupDto } from '@erp-platform/contracts';

import type { Cell } from '../../../../lib/xlsx';

/**
 * Price list ⇄ Excel (clothing client: hundreds of items × sizes, a separate price per channel).
 * Export = one row per active variant (plus one row per quantity break), so the sheet doubles as
 * a template: fill the list-price column and import it back. Import matches rows by SKU — the
 * one code every variant has — and ignores rows with an empty price.
 */
export const EXCEL_COLUMNS = {
  code: 'كود الصنف',
  sku: 'SKU',
  name: 'الصنف',
  options: 'المقاس / اللون',
  minQuantity: 'أقل كمية',
  normalPrice: 'السعر العادي',
  listPrice: 'سعر القائمة',
} as const;

export interface ExcelRow {
  variantId: string;
  minQuantity: string;
  price: string;
}

const optionsText = (variant: ProductVariantLookupDto) =>
  Object.values(variant.attributeValues ?? {})
    .map((value) => String(value))
    .join(' / ');

/** Header + rows for downloadXlsx. `priceOf` = the list's price for a variant at a min quantity, if any. */
export function exportSheet(
  variants: Iterable<ProductVariantLookupDto>,
  rows: { variantId: string; minQuantity: string; price: string }[],
  normalPrice: (variant: ProductVariantLookupDto) => string | null,
): { header: string[]; body: Cell[][] } {
  const byVariant = new Map<string, { minQuantity: string; price: string }[]>();
  for (const row of rows) {
    if (!row.variantId) continue;
    const list = byVariant.get(row.variantId) ?? [];
    list.push({ minQuantity: row.minQuantity, price: row.price });
    byVariant.set(row.variantId, list);
  }
  const body: Cell[][] = [];
  const sorted = [...variants]
    .filter((v) => v.isActive && v.productIsActive)
    .sort((a, b) => a.productCode.localeCompare(b.productCode) || a.sku.localeCompare(b.sku));
  for (const variant of sorted) {
    const own = byVariant.get(variant.id) ?? [];
    const base = own.find((r) => !r.minQuantity || Number(r.minQuantity) === 0);
    const line = (minQuantity: string, price: string): Cell[] => [
      variant.productCode,
      variant.sku,
      variant.productName,
      optionsText(variant),
      minQuantity,
      normalPrice(variant) ?? '',
      price,
    ];
    body.push(line('', base?.price ?? ''));
    for (const extra of own.filter((r) => r !== base)) body.push(line(extra.minQuantity, extra.price));
  }
  return { header: Object.values(EXCEL_COLUMNS), body };
}

export interface ImportResult {
  rows: ExcelRow[];
  unknownSkus: string[];
  badPrices: number;
}

/** Rows read back from a sheet (header row first). Columns are found by their header text. */
export function parseSheet(sheet: string[][], variantsBySku: ReadonlyMap<string, ProductVariantLookupDto>): ImportResult | null {
  const [header, ...data] = sheet;
  if (!header) return null;
  const col = (name: string) => header.findIndex((h) => h.trim() === name);
  const sku = col(EXCEL_COLUMNS.sku);
  const price = col(EXCEL_COLUMNS.listPrice);
  const min = col(EXCEL_COLUMNS.minQuantity);
  if (sku < 0 || price < 0) return null;
  const rows: ExcelRow[] = [];
  const unknownSkus: string[] = [];
  let badPrices = 0;
  for (const line of data) {
    const priceText = (line[price] ?? '').replace(/,/g, '').trim();
    if (!priceText) continue;
    const code = (line[sku] ?? '').trim();
    const variant = variantsBySku.get(code.toLowerCase());
    if (!variant) {
      if (code) unknownSkus.push(code);
      continue;
    }
    const minQuantity = min >= 0 ? (line[min] ?? '').trim() : '';
    if (!/^\d+(\.\d{1,2})?$/.test(priceText) || (minQuantity && !/^\d+(\.\d{1,3})?$/.test(minQuantity))) {
      badPrices += 1;
      continue;
    }
    rows.push({ variantId: variant.id, minQuantity: Number(minQuantity) > 0 ? minQuantity : '', price: priceText });
  }
  return { rows, unknownSkus, badPrices };
}
