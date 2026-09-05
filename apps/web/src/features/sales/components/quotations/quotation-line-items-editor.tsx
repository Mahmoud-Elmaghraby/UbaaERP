import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { useProductsWithVariants } from '../../../inventory/api/products/queries';

export interface QuotationLineDraft {
  key: string;
  productVariantId: string | undefined;
  quantity: string;
  /** Decimal string — converted to MoneyDto.amountMinorUnits via decimalToMinorUnits()
   * on submit, same convention as Purchase Orders' line editor. */
  unitPrice: string;
  notes: string;
}

let nextKey = 0;
export function createEmptyQuotationLine(): QuotationLineDraft {
  nextKey += 1;
  return { key: `new-${nextKey}`, productVariantId: undefined, quantity: '', unitPrice: '', notes: '' };
}

/**
 * Near-identical duplicate of PurchaseOrderLineItemsEditor — deliberately duplicated
 * per-entity rather than shared, matching the ESLint boundaries rule that disallows
 * Sales entities importing each other's components directly. The backend enforces a
 * single currency across a quotation's lines (assertSingleCurrency() in
 * QuotationsService.create()/update()) — the surrounding form only ever offers one
 * currency (the selected customer's defaultCurrency), which satisfies that constraint
 * by construction, same as Purchase Orders' manual-create path.
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
  const { data: productsWithVariants } = useProductsWithVariants();

  const options = useMemo(
    () =>
      productsWithVariants.flatMap((product) =>
        product.variants.map((variant) => ({
          value: variant.id,
          label: `${product.name} — ${variant.sku}`,
        })),
      ),
    [productsWithVariants],
  );

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
              <TableHead>{t('sales.quotations.lineProduct')}</TableHead>
              <TableHead className="w-28">{t('sales.quotations.lineQuantity')}</TableHead>
              <TableHead className="w-36">{t('sales.quotations.lineUnitPrice', { currency })}</TableHead>
              <TableHead>{t('sales.quotations.lineNotes')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.key}>
                <TableCell>
                  <Select
                    value={line.productVariantId}
                    onValueChange={(value) => updateLine(line.key, { productVariantId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('sales.quotations.selectProduct')} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
        {t('sales.quotations.addLine')}
      </Button>
    </div>
  );
}
