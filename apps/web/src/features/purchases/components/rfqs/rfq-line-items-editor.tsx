import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { ProductVariantPicker } from '../../../../components/product/product-variant-picker';

export interface RfqLineDraft {
  key: string;
  productVariantId: string | undefined;
  quantity: string;
  notes: string;
}

let nextKey = 0;
export function createEmptyRfqLine(): RfqLineDraft {
  nextKey += 1;
  return { key: `new-${nextKey}`, productVariantId: undefined, quantity: '', notes: '' };
}

/**
 * Same plain controlled-state line-items editor as
 * purchase-requisitions/purchase-requisition-line-items-editor.tsx — deliberately
 * duplicated rather than imported (Purchases entities must not import each other's
 * components directly, same ESLint boundary rule as Inventory's five entities; see
 * that file's own class comment for the full useFieldArray-avoidance rationale).
 */
export function RfqLineItemsEditor({
  lines,
  onChange,
}: {
  lines: RfqLineDraft[];
  onChange: (lines: RfqLineDraft[]) => void;
}) {
  const { t } = useTranslation();

  function updateLine(key: string, patch: Partial<RfqLineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    onChange(lines.filter((line) => line.key !== key));
  }

  function addLine() {
    onChange([...lines, createEmptyRfqLine()]);
  }

  return (
    <div className="grid gap-2">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('purchases.rfqs.lineProduct')}</TableHead>
              <TableHead className="w-28">{t('purchases.rfqs.lineQuantity')}</TableHead>
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
