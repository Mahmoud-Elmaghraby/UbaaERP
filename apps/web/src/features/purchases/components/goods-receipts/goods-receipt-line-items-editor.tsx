import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useVariantIndex } from '../../hooks/goods-receipts/use-variant-index';
import type { RemainingPoLine } from '../../hooks/goods-receipts/use-purchase-order-remaining';
import { formatMoney } from '../../../../lib/money';
import {
  emptyReceiptLotsDraft,
  ReceiptLotsEditor,
  type ReceiptLotsDraft,
} from '../../../../components/document/lot-entry';

export interface GoodsReceiptLineDraft {
  quantityReceived: string;
  /** Decimal string override — blank means "use the purchase order line's own price",
   * applied server-side (createGoodsReceiptLineSchema.unitCost is optional). */
  unitCost: string;
  notes: string;
  /** Lots/serials — only used when the line's product is lot/serial-tracked. */
  lots: ReceiptLotsDraft;
}

export type GoodsReceiptLineDrafts = Record<string, GoodsReceiptLineDraft>;

export function createEmptyGoodsReceiptDrafts(remainingLines: RemainingPoLine[]): GoodsReceiptLineDrafts {
  const drafts: GoodsReceiptLineDrafts = {};
  for (const line of remainingLines) {
    drafts[line.purchaseOrderLineId] = { quantityReceived: '', unitCost: '', notes: '', lots: emptyReceiptLotsDraft() };
  }
  return drafts;
}

/**
 * Unlike every other Purchases line editor (freeform add/remove rows), a goods receipt's
 * rows are fixed by the selected purchase order's own outstanding lines — you can't
 * receive a product that isn't on the PO. This renders one row per PO line that still has
 * a remaining (undelivered) quantity, with a quantity-to-receive input and an optional
 * unit cost override (blank = the PO line's own price, applied server-side). Rows left at
 * 0 are excluded when the form builds the submitted DTO (see prepareLines() in
 * goods-receipt-form.tsx) — a partial receipt (some lines, or a partial quantity on a
 * line) is entirely normal; the backend re-validates the remaining-quantity cap
 * independently, this is a client-side convenience only.
 */
export function GoodsReceiptLineItemsEditor({
  remainingLines,
  drafts,
  onChange,
}: {
  remainingLines: RemainingPoLine[];
  drafts: GoodsReceiptLineDrafts;
  onChange: (drafts: GoodsReceiptLineDrafts) => void;
}) {
  const { t } = useTranslation();
  const variantIndex = useVariantIndex();

  function updateDraft(purchaseOrderLineId: string, patch: Partial<GoodsReceiptLineDraft>) {
    const current = drafts[purchaseOrderLineId] ?? {
      quantityReceived: '',
      unitCost: '',
      notes: '',
      lots: emptyReceiptLotsDraft(),
    };
    onChange({ ...drafts, [purchaseOrderLineId]: { ...current, ...patch } });
  }

  const receivableLines = remainingLines.filter((line) => line.remaining > 0);

  if (receivableLines.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('purchases.goodsReceipts.nothingRemaining')}</p>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('purchases.goodsReceipts.lineProduct')}</TableHead>
            <TableHead className="w-20">{t('purchases.goodsReceipts.lineOrdered')}</TableHead>
            <TableHead className="w-20">{t('purchases.goodsReceipts.lineRemaining')}</TableHead>
            <TableHead className="w-32">{t('purchases.goodsReceipts.lineQuantityReceived')}</TableHead>
            <TableHead className="w-36">{t('purchases.goodsReceipts.lineUnitCost')}</TableHead>
            <TableHead>{t('purchases.goodsReceipts.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {receivableLines.map((line) => {
            const draft = drafts[line.purchaseOrderLineId] ?? {
              quantityReceived: '',
              unitCost: '',
              notes: '',
              lots: emptyReceiptLotsDraft(),
            };
            const variant = variantIndex.get(line.productVariantId);
            const trackingType = variant?.trackingType ?? 'none';
            const quantity = Number(draft.quantityReceived) || 0;
            return (
              <Fragment key={line.purchaseOrderLineId}>
                <TableRow className={trackingType !== 'none' ? 'border-b-0' : undefined}>
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
                      value={draft.quantityReceived}
                      onChange={(e) => updateDraft(line.purchaseOrderLineId, { quantityReceived: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      placeholder={formatMoney(line.unitPrice.amountMinorUnits, line.unitPrice.currency)}
                      value={draft.unitCost}
                      onChange={(e) => updateDraft(line.purchaseOrderLineId, { unitCost: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={draft.notes}
                      onChange={(e) => updateDraft(line.purchaseOrderLineId, { notes: e.target.value })}
                    />
                  </TableCell>
                </TableRow>
                {trackingType !== 'none' ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="pt-0">
                      <ReceiptLotsEditor
                        trackingType={trackingType}
                        quantity={quantity}
                        draft={draft.lots}
                        onChange={(lots) => updateDraft(line.purchaseOrderLineId, { lots })}
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
