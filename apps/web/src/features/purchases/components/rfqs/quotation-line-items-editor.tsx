import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { ProductVariantPicker } from '../../../../components/product/product-variant-picker';

export interface QuotationLineDraft {
  key: string;
  productVariantId: string | undefined;
  quantity: string;
  /** Decimal string (e.g. "12.50") — converted to MoneyDto.amountMinorUnits via
   * decimalToMinorUnits() on submit, same convention as every other money field. */
  unitPrice: string;
  notes: string;
}

let nextKey = 0;
export function createEmptyQuotationLine(): QuotationLineDraft {
  nextKey += 1;
  return { key: `new-${nextKey}`, productVariantId: undefined, quantity: '', unitPrice: '', notes: '' };
}

/**
 * Same shape as RfqLineItemsEditor plus one column: unitPrice. The line's currency is not
 * editable here — it's always the quotation's supplier's own defaultCurrency, applied
 * uniformly by the surrounding form when building the DTO (a supplier quotes in one
 * currency; the backend doesn't enforce this — no assertSingleCurrency() on this entity,
 * unlike Purchase Orders/Invoices — but there is also no per-line currency picker in the
 * UI, so this is the only currency a line can end up with in practice).
 */
export function QuotationLineItemsEditor({
  lines,
  onChange,
  currency,
}: {
  lines: QuotationLineDraft[];
  onChange: (lines: QuotationLineDraft[]) => void;
  currency: string;
}) {
  const { t } = useTranslation();

  function updateLine(key: string, patch: Partial<QuotationLineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    onChange(lines.filter((line) => line.key !== key));
  }

  function addLine() {
    onChange([...lines, createEmptyQuotationLine()]);
  }

  return (
    <div className="grid gap-2">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('purchases.rfqs.lineProduct')}</TableHead>
              <TableHead className="w-28">{t('purchases.rfqs.lineQuantity')}</TableHead>
              <TableHead className="w-36">{t('purchases.rfqs.lineUnitPrice', { currency })}</TableHead>
              <TableHead>{t('purchases.rfqs.lineNotes')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.key}>
                <TableCell>
                  <ProductVariantPicker
                    value={line.productVariantId}
                    onChange={(value) => updateLine(line.key, { productVariantId: value })}
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
        {t('purchases.rfqs.addLine')}
      </Button>
    </div>
  );
}
