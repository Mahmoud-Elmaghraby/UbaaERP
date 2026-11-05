import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';
import { Plus, Trash2 } from 'lucide-react';

import { ProductVariantPicker } from '../product/product-variant-picker';
import { defaultUnitId, unitPriceText } from '../product/variant-search';
import { LineUnitSelect } from '../product/unit-select';
import { repricedValue, type SalePricer } from '../product/sale-pricing';
import { decimalToMinorUnits, formatAmount, minorUnitsToDecimalString, multiplyMinorUnits } from '../../lib/money';
import { useVariantLookupMap } from '../../features/inventory/api/products/queries';
import { emptyReceiptLotsDraft, ReceiptLotsEditor, type ReceiptLotsDraft } from './lot-entry';
import { LineTaxPicker } from '../taxes/line-tax-picker';
import type { LineTaxesController } from '../taxes/use-line-taxes';

export interface DirectLineDraft {
  key: string;
  productVariantId: string;
  /** Line unit (carton, sack…); null = the product's base unit. */
  unitOfMeasureId: string | null;
  quantity: string;
  unitPrice: string;
  notes: string;
  /** Lots/serials received with this line — only when the invoice also receives the goods. */
  lots: ReceiptLotsDraft;
  /** Line discount as typed: "10%" (percentage) or "25" (fixed amount); '' = none. */
  discount: string;
}

let keySeq = 0;
export function newDirectLine(): DirectLineDraft {
  keySeq += 1;
  return {
    key: `line-${Date.now()}-${keySeq}`,
    productVariantId: '',
    unitOfMeasureId: null,
    quantity: '1',
    unitPrice: '',
    notes: '',
    lots: emptyReceiptLotsDraft(),
    discount: '',
  };
}

export type LineDiscount =
  | { discountType: null; discountPercentage: null; discountFixedAmount: null }
  | { discountType: 'percentage'; discountPercentage: number; discountFixedAmount: null }
  | { discountType: 'fixed'; discountPercentage: null; discountFixedAmount: { amountMinorUnits: string; currency: string } };

/** "10%" → 10 percent, "25" → a fixed 25.00, "" → none; null when it can't be read. */
export function parseLineDiscount(text: string, currency: string): LineDiscount | null {
  const value = text.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace('٪', '%');
  if (value === '') return { discountType: null, discountPercentage: null, discountFixedAmount: null };
  if (value.endsWith('%')) {
    const pct = Number(value.slice(0, -1));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
    return { discountType: 'percentage', discountPercentage: pct, discountFixedAmount: null };
  }
  try {
    const amountMinorUnits = decimalToMinorUnits(value);
    if (BigInt(amountMinorUnits) < 0n) return null;
    return { discountType: 'fixed', discountPercentage: null, discountFixedAmount: { amountMinorUnits, currency } };
  } catch {
    return null;
  }
}

/** The saved discount back as the text a user would type. */
export function lineDiscountText(source: {
  discountType?: string | null;
  discountPercentage?: number | null;
  discountFixedAmount?: { amountMinorUnits: string } | null;
}): string {
  if (source.discountType === 'percentage' && source.discountPercentage !== null && source.discountPercentage !== undefined) {
    return `${source.discountPercentage}%`;
  }
  if (source.discountType === 'fixed' && source.discountFixedAmount) return minorUnitsToDecimalString(source.discountFixedAmount.amountMinorUnits);
  return '';
}

/** Minor-unit amount of one row for the live preview, or null when incomplete. */
export function previewDirectLineAmount(line: DirectLineDraft): string | null {
  const quantity = Number(line.quantity);
  if (!line.unitPrice.trim() || !Number.isFinite(quantity) || quantity <= 0) return null;
  try {
    const gross = BigInt(multiplyMinorUnits(decimalToMinorUnits(line.unitPrice), line.quantity.trim()));
    const discount = parseLineDiscount(line.discount ?? '', 'XXX');
    if (!discount || discount.discountType === null) return gross.toString();
    const off =
      discount.discountType === 'percentage'
        ? (gross * BigInt(Math.round(discount.discountPercentage * 100))) / 10000n
        : BigInt(discount.discountFixedAmount.amountMinorUnits);
    return (gross - off < 0n ? 0n : gross - off).toString();
  } catch {
    return null;
  }
}

/**
 * Validates every row and returns them parsed, or null if any row is incomplete/invalid.
 * Shared by Sales and Purchases direct invoices (the two DTOs only differ in the
 * quantity field's name, which each caller maps itself).
 */
export function parseDirectLines(
  lines: DirectLineDraft[],
  currency: string,
):
  | {
      productVariantId: string;
      unitOfMeasureId: string | null;
      quantity: number;
      unitPrice: { amountMinorUnits: string; currency: string };
      notes?: string;
    }[]
  | null {
  if (lines.length === 0) return null;
  const result = [];
  for (const line of lines) {
    const quantity = Number(line.quantity);
    if (!line.productVariantId || !Number.isFinite(quantity) || quantity <= 0) return null;
    let amountMinorUnits: string;
    try {
      amountMinorUnits = decimalToMinorUnits(line.unitPrice);
    } catch {
      return null;
    }
    if (BigInt(amountMinorUnits) < 0n) return null;
    result.push({
      productVariantId: line.productVariantId,
      unitOfMeasureId: line.unitOfMeasureId,
      quantity,
      unitPrice: { amountMinorUnits, currency },
      notes: line.notes.trim() === '' ? undefined : line.notes,
    });
  }
  return result;
}

/**
 * Free-form invoice lines (pick any product, quantity and price) for the "direct"
 * invoicing path used when the tenant has turned Sales/Purchase Orders off.
 */
export function DirectLinesEditor({
  lines,
  onChange,
  priceKind,
  currency,
  receiveLots = false,
  taxes,
  pricer: salePricer,
  discounts = false,
}: {
  lines: DirectLineDraft[];
  onChange: (lines: DirectLineDraft[]) => void;
  /** Which default item price prefills a line when a product is picked. */
  priceKind: 'sale' | 'purchase';
  currency: string;
  /** Show lot/serial entry under tracked items (purchase invoice that also receives the goods). */
  receiveLots?: boolean;
  /** Per-line tax choice (invoices); omitted = no tax column. */
  taxes?: LineTaxesController;
  /** Sales: default prices from the document's price list (sale-pricing.ts). */
  pricer?: SalePricer;
  /** Show a per-line discount cell ("10%" or a fixed amount). */
  discounts?: boolean;
}) {
  const { t } = useTranslation();
  const variants = useVariantLookupMap();
  const pricer: SalePricer =
    salePricer ?? ((variant, unitOfMeasureId) => unitPriceText(variant, unitOfMeasureId, priceKind, currency));

  function update(key: string, patch: Partial<DirectLineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  return (
    <div className="flex flex-col">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10 text-center">#</TableHead>
            <TableHead>{t('sales.salesInvoices.lineProduct')}</TableHead>
            <TableHead className="w-28">{t('documents.quantity')}</TableHead>
            <TableHead className="w-36">{t('documents.unitPrice')}</TableHead>
            {discounts ? <TableHead className="w-28">{t('documents.lineDiscount')}</TableHead> : null}
            <TableHead className="w-32 text-end">{t('documents.lineTotal')}</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, index) => {
            const amount = previewDirectLineAmount(line);
            const trackingType = receiveLots ? (variants.get(line.productVariantId)?.trackingType ?? 'none') : 'none';
            return (
              <Fragment key={line.key}>
                <TableRow className={trackingType !== 'none' ? 'border-b-0' : undefined}>
                  <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 py-1">
                      <ProductVariantPicker
                        className="h-9"
                        value={line.productVariantId}
                        onChange={(value, variant) => {
                          const unitOfMeasureId = defaultUnitId(variant, priceKind);
                          const price =
                            line.unitPrice.trim() === '' ? pricer(variant, unitOfMeasureId, line.quantity) : null;
                          update(line.key, { productVariantId: value, unitOfMeasureId, ...(price ? { unitPrice: price } : {}) });
                        }}
                      />
                      <LineUnitSelect
                        variant={variants.get(line.productVariantId)}
                        value={line.unitOfMeasureId}
                        onChange={(unitOfMeasureId) => {
                          const price = pricer(variants.get(line.productVariantId), unitOfMeasureId, line.quantity);
                          update(line.key, { unitOfMeasureId, ...(price ? { unitPrice: price } : {}) });
                        }}
                      />
                      <Input
                        className="h-8 text-xs"
                        placeholder={t('sales.salesInvoices.lineNotes')}
                        aria-label={t('sales.salesInvoices.lineNotes')}
                        value={line.notes}
                        onChange={(e) => update(line.key, { notes: e.target.value })}
                      />
                      {taxes && line.productVariantId ? (
                        <LineTaxPicker
                          scope={taxes.scope}
                          value={taxes.valueFor(line.key, line.productVariantId)}
                          onChange={(ids) => taxes.onChange(line.key, ids)}
                        />
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      className="h-9 text-end"
                      aria-label={t('documents.quantity')}
                      value={line.quantity}
                      onChange={(e) => {
                        const quantity = e.target.value;
                        const price = repricedValue(line, variants, { pricer }, pricer, { quantity });
                        update(line.key, { quantity, ...(price ? { unitPrice: price } : {}) });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      className="h-9 text-end"
                      placeholder="0.00"
                      aria-label={t('documents.unitPrice')}
                      value={line.unitPrice}
                      onChange={(e) => update(line.key, { unitPrice: e.target.value })}
                    />
                  </TableCell>
                  {discounts ? (
                    <TableCell>
                      <Input
                        className={`h-9 text-end ${parseLineDiscount(line.discount ?? '', currency) ? '' : 'border-destructive'}`}
                        placeholder="0 / 10%"
                        dir="ltr"
                        aria-label={t('documents.lineDiscount')}
                        value={line.discount ?? ''}
                        onChange={(e) => update(line.key, { discount: e.target.value })}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="text-end font-semibold">
                    {amount ? formatAmount(amount) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('documents.removeLine')}
                      disabled={lines.length === 1}
                      onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
                {trackingType !== 'none' ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell />
                    <TableCell colSpan={discounts ? 6 : 5} className="pt-0">
                      <ReceiptLotsEditor
                        trackingType={trackingType}
                        quantity={Number(line.quantity) || 0}
                        draft={line.lots}
                        onChange={(lots) => update(line.key, { lots })}
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      <div className="border-t px-5 py-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange([...lines, newDirectLine()])}
        >
          <Plus />
          {t('documents.addLine')}
        </Button>
      </div>
    </div>
  );
}
