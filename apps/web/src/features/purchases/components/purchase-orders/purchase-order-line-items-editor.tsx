import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { ProductVariantPicker } from '../../../../components/product/product-variant-picker';
import { defaultUnitId, unitPriceText } from '../../../../components/product/variant-search';
import { LineUnitSelect } from '../../../../components/product/unit-select';
import { useVariantLookupMap } from '../../../inventory/api/products/queries';

export interface PurchaseOrderLineDraft {
  key: string;
  productVariantId: string | undefined;
  /** Line unit (carton, sack…); null = the product's base unit. */
  unitOfMeasureId: string | null;
  quantity: string;
  /** Decimal string — converted to MoneyDto.amountMinorUnits via decimalToMinorUnits()
   * on submit, same convention as Supplier Quotations' line editor. */
  unitPrice: string;
  notes: string;
}

let nextKey = 0;
export function createEmptyPurchaseOrderLine(): PurchaseOrderLineDraft {
  nextKey += 1;
  return { key: `new-${nextKey}`, productVariantId: undefined,
    unitOfMeasureId: null, quantity: '', unitPrice: '', notes: '' };
}

/**
 * Near-identical duplicate of RfqLineItemsEditor/QuotationLineItemsEditor — deliberately
 * duplicated per-entity rather than shared, matching the ESLint boundaries rule that
 * disallows Purchases entities importing each other's components directly.
 *
 * Unlike Supplier Quotations, the backend DOES enforce a single currency across a
 * purchase order's lines (assertSingleCurrency() in PurchaseOrdersService.create()/
 * update()) — the surrounding form only ever offers one currency (the manual-create
 * path's selected supplier's defaultCurrency), which satisfies that constraint by
 * construction, same as it does today for Supplier Quotations as a UI simplification.
 */
export function PurchaseOrderLineItemsEditor({
  lines,
  onChange,
  currency,
}: {
  lines: PurchaseOrderLineDraft[];
  onChange: (lines: PurchaseOrderLineDraft[]) => void;
  currency: string;
}) {
  const { t } = useTranslation();
  const variants = useVariantLookupMap();

  function updateLine(key: string, patch: Partial<PurchaseOrderLineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    onChange(lines.filter((line) => line.key !== key));
  }

  function addLine() {
    onChange([...lines, createEmptyPurchaseOrderLine()]);
  }

  return (
    <div className="grid gap-2">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('purchases.purchaseOrders.lineProduct')}</TableHead>
              <TableHead className="w-28">{t('purchases.purchaseOrders.lineQuantity')}</TableHead>
              <TableHead className="w-36">{t('purchases.purchaseOrders.lineUnitPrice', { currency })}</TableHead>
              <TableHead>{t('purchases.purchaseOrders.lineNotes')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.key}>
                <TableCell>
                  <ProductVariantPicker
                    value={line.productVariantId}
                    onChange={(value, variant) => {
                      const unitOfMeasureId = defaultUnitId(variant, 'purchase');
                      const price =
                        line.unitPrice.trim() === '' ? unitPriceText(variant, unitOfMeasureId, 'purchase', currency) : null;
                      updateLine(line.key, {
                        productVariantId: value,
                        unitOfMeasureId,
                        ...(price ? { unitPrice: price } : {}),
                      });
                    }}
                  />
                  <LineUnitSelect
                    className="mt-1 h-8 w-full"
                    variant={variants.get(line.productVariantId ?? '')}
                    value={line.unitOfMeasureId}
                    onChange={(unitOfMeasureId) => {
                      const price = unitPriceText(
                        variants.get(line.productVariantId ?? ''),
                        unitOfMeasureId,
                        'purchase',
                        currency,
                      );
                      updateLine(line.key, { unitOfMeasureId, ...(price ? { unitPrice: price } : {}) });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input value={line.notes} onChange={(e) => updateLine(line.key, { notes: e.target.value })} />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={addLine}>
        <Plus className="me-1 h-4 w-4" />
        {t('purchases.purchaseOrders.addLine')}
      </Button>
    </div>
  );
}
