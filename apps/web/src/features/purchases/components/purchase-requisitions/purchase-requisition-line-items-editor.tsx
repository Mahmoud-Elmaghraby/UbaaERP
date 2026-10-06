import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
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

import { ProductVariantPicker } from '../../../../components/product/product-variant-picker';

export interface PurchaseRequisitionLineDraft {
  /** Local React key only — never sent to the backend (lines have no client-assigned id). */
  key: string;
  productVariantId: string | undefined;
  quantity: string;
  notes: string;
}

let nextKey = 0;
export function createEmptyLine(): PurchaseRequisitionLineDraft {
  nextKey += 1;
  return { key: `new-${nextKey}`, productVariantId: undefined, quantity: '', notes: '' };
}

/**
 * Plain controlled-state line-items editor — deliberately NOT wired into react-hook-form via
 * useFieldArray. See PurchaseRequisitionForm's class comment for why: this codebase's existing
 * precedent for a dynamic array inside a form (Inventory's ApplyLandedCostForm) explicitly
 * avoided registering a dynamic list against a static Zod resolver without a working `tsc` in
 * this session, and useFieldArray's generics are exactly the kind of thing that's easy to get
 * subtly wrong without a compiler to check it. The surrounding form manages `lines` as its own
 * useState and merges it into the submitted DTO by hand.
 *
 * The per-row product picker is the shared searchable ProductVariantPicker (name / SKU /
 * code / barcode) over the catalogue fetched once for the whole page.
 */
export function PurchaseRequisitionLineItemsEditor({
  lines,
  onChange,
}: {
  lines: PurchaseRequisitionLineDraft[];
  onChange: (lines: PurchaseRequisitionLineDraft[]) => void;
}) {
  const { t } = useTranslation();


  function updateLine(key: string, patch: Partial<PurchaseRequisitionLineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    onChange(lines.filter((line) => line.key !== key));
  }

  function addLine() {
    onChange([...lines, createEmptyLine()]);
  }

  return (
    <div className="grid gap-2">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('purchases.purchaseRequisitions.lineProduct')}</TableHead>
              <TableHead className="w-28">{t('purchases.purchaseRequisitions.lineQuantity')}</TableHead>
              <TableHead>{t('purchases.purchaseRequisitions.lineNotes')}</TableHead>
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
                    value={line.notes}
                    onChange={(e) => updateLine(line.key, { notes: e.target.value })}
                  />
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
        {t('purchases.purchaseRequisitions.addLine')}
      </Button>
    </div>
  );
}
