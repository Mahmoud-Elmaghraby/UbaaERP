import { useTranslation } from 'react-i18next';
import { Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useVariantIndex } from '../../hooks/sales-returns/use-variant-index';
import type { ReturnableDeliveryLine } from '../../hooks/sales-returns/use-delivery-returnable';

export interface SalesReturnLineDraft {
  quantityReturned: string;
  reason: string;
  notes: string;
}

export type SalesReturnLineDrafts = Record<string, SalesReturnLineDraft>;

export function createEmptySalesReturnDrafts(returnableLines: ReturnableDeliveryLine[]): SalesReturnLineDrafts {
  const drafts: SalesReturnLineDrafts = {};
  for (const line of returnableLines) {
    drafts[line.deliveryLineId] = { quantityReturned: '', reason: '', notes: '' };
  }
  return drafts;
}

/**
 * Same "worksheet, not freeform rows" shape as Purchases' PurchaseReturnLineItemsEditor
 * — a sales return can only reference lines that already exist on the selected
 * delivery, so this renders one row per delivery line that still has a returnable
 * (not-yet-returned) quantity, with a quantity-to-return input, a reason, and notes.
 * Like Purchase Returns (and Deliveries themselves), there's no unit cost/currency
 * column at all — sales returns are a physical record only, not a financial credit
 * note (see SalesReturnsService's own doc comment). Rows left at 0 are excluded when
 * the form builds the submitted DTO.
 */
export function SalesReturnLineItemsEditor({
  returnableLines,
  drafts,
  onChange,
}: {
  returnableLines: ReturnableDeliveryLine[];
  drafts: SalesReturnLineDrafts;
  onChange: (drafts: SalesReturnLineDrafts) => void;
}) {
  const { t } = useTranslation();
  const variantIndex = useVariantIndex();

  function updateDraft(deliveryLineId: string, patch: Partial<SalesReturnLineDraft>) {
    const current = drafts[deliveryLineId] ?? { quantityReturned: '', reason: '', notes: '' };
    onChange({ ...drafts, [deliveryLineId]: { ...current, ...patch } });
  }

  const returnable = returnableLines.filter((line) => line.remaining > 0);

  if (returnable.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('sales.salesReturns.nothingReturnable')}</p>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('sales.salesReturns.lineProduct')}</TableHead>
            <TableHead className="w-20">{t('sales.salesReturns.lineDelivered')}</TableHead>
            <TableHead className="w-20">{t('sales.salesReturns.lineRemaining')}</TableHead>
            <TableHead className="w-32">{t('sales.salesReturns.lineQuantityReturned')}</TableHead>
            <TableHead className="w-36">{t('sales.salesReturns.lineReason')}</TableHead>
            <TableHead>{t('sales.salesReturns.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {returnable.map((line) => {
            const draft = drafts[line.deliveryLineId] ?? { quantityReturned: '', reason: '', notes: '' };
            const variant = variantIndex.get(line.productVariantId);
            return (
              <TableRow key={line.deliveryLineId}>
                <TableCell>{variant ? `${variant.productName} — ${variant.sku}` : line.productVariantId}</TableCell>
                <TableCell>{line.delivered}</TableCell>
                <TableCell>{line.remaining}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    max={line.remaining}
                    step="any"
                    inputMode="decimal"
                    value={draft.quantityReturned}
                    onChange={(e) => updateDraft(line.deliveryLineId, { quantityReturned: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={draft.reason}
                    onChange={(e) => updateDraft(line.deliveryLineId, { reason: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={draft.notes}
                    onChange={(e) => updateDraft(line.deliveryLineId, { notes: e.target.value })}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
