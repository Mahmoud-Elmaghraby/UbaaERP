import { useTranslation } from 'react-i18next';
import { Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useVariantIndex } from '../../hooks/deliveries/use-variant-index';
import type { RemainingSoLine } from '../../hooks/deliveries/use-sales-order-remaining';

export interface DeliveryLineDraft {
  quantityDelivered: string;
  notes: string;
}

export type DeliveryLineDrafts = Record<string, DeliveryLineDraft>;

export function createEmptyDeliveryDrafts(remainingLines: RemainingSoLine[]): DeliveryLineDrafts {
  const drafts: DeliveryLineDrafts = {};
  for (const line of remainingLines) {
    drafts[line.salesOrderLineId] = { quantityDelivered: '', notes: '' };
  }
  return drafts;
}

/**
 * Same "worksheet, not freeform rows" shape as Purchases' GoodsReceiptLineItemsEditor —
 * a delivery's rows are fixed by the selected sales order's own outstanding lines (you
 * can't deliver a product that isn't on the order). Unlike Goods Receipts, there's no
 * unit cost column at all — deliveries carry no Money (see migration 0044's comment;
 * mirrors Purchase Returns' "no Money" precedent instead). Rows left at 0 are excluded
 * when the form builds the submitted DTO (see prepareLines() in delivery-form.tsx) — a
 * partial delivery is entirely normal; the backend re-validates the remaining-quantity
 * cap independently, this is a client-side convenience only.
 */
export function DeliveryLineItemsEditor({
  remainingLines,
  drafts,
  onChange,
}: {
  remainingLines: RemainingSoLine[];
  drafts: DeliveryLineDrafts;
  onChange: (drafts: DeliveryLineDrafts) => void;
}) {
  const { t } = useTranslation();
  const variantIndex = useVariantIndex();

  function updateDraft(salesOrderLineId: string, patch: Partial<DeliveryLineDraft>) {
    const current = drafts[salesOrderLineId] ?? { quantityDelivered: '', notes: '' };
    onChange({ ...drafts, [salesOrderLineId]: { ...current, ...patch } });
  }

  const deliverableLines = remainingLines.filter((line) => line.remaining > 0);

  if (deliverableLines.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('sales.deliveries.nothingRemaining')}</p>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('sales.deliveries.lineProduct')}</TableHead>
            <TableHead className="w-20">{t('sales.deliveries.lineOrdered')}</TableHead>
            <TableHead className="w-20">{t('sales.deliveries.lineRemaining')}</TableHead>
            <TableHead className="w-32">{t('sales.deliveries.lineQuantityDelivered')}</TableHead>
            <TableHead>{t('sales.deliveries.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deliverableLines.map((line) => {
            const draft = drafts[line.salesOrderLineId] ?? { quantityDelivered: '', notes: '' };
            const variant = variantIndex.get(line.productVariantId);
            return (
              <TableRow key={line.salesOrderLineId}>
                <TableCell>{variant ? `${variant.productName} — ${variant.sku}` : line.productVariantId}</TableCell>
                <TableCell>{line.ordered}</TableCell>
                <TableCell>{line.remaining}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    max={line.remaining}
                    step="any"
                    inputMode="decimal"
                    value={draft.quantityDelivered}
                    onChange={(e) => updateDraft(line.salesOrderLineId, { quantityDelivered: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={draft.notes}
                    onChange={(e) => updateDraft(line.salesOrderLineId, { notes: e.target.value })}
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
