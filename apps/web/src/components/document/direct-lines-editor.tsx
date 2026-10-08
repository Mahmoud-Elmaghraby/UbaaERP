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
import { decimalToMinorUnits, formatAmount, multiplyMinorUnits } from '../../lib/money';
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
  };
}

/** Minor-unit amount of one row for the live preview, or null when incomplete. */
export function previewDirectLineAmount(line: DirectLineDraft): string | null {
  const quantity = Number(line.quantity);
  if (!line.unitPrice.trim() || !Number.isFinite(quantity) || quantity <= 0) return null;
  try {
    return multiplyMinorUnits(decimalToMinorUnits(line.unitPrice), line.quantity.trim());
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
}) {
  const { t } = useTranslation();
  const variants = useVariantLookupMap();

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
                            line.unitPrice.trim() === ''
                              ? unitPriceText(variant, unitOfMeasureId, priceKind, currency)
                              : null;
                          update(line.key, { productVariantId: value, unitOfMeasureId, ...(price ? { unitPrice: price } : {}) });
                        }}
                      />
                      <LineUnitSelect
                        variant={variants.get(line.productVariantId)}
                        value={line.unitOfMeasureId}
                        onChange={(unitOfMeasureId) => {
                          const price = unitPriceText(variants.get(line.productVariantId), unitOfMeasureId, priceKind, currency);
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
                      onChange={(e) => update(line.key, { quantity: e.target.value })}
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
                    <TableCell colSpan={5} className="pt-0">
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
