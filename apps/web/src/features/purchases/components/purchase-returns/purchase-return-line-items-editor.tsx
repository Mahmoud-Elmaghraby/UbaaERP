import { useTranslation } from 'react-i18next';
import { Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useVariantIndex } from '../../hooks/purchase-returns/use-variant-index';
import type { ReturnableReceiptLine } from '../../hooks/purchase-returns/use-goods-receipt-returnable';

export interface PurchaseReturnLineDraft {
  quantityReturned: string;
  reason: string;
  notes: string;
}

export type PurchaseReturnLineDrafts = Record<string, PurchaseReturnLineDraft>;

export function createEmptyPurchaseReturnDrafts(returnableLines: ReturnableReceiptLine[]): PurchaseReturnLineDrafts {
  const drafts: PurchaseReturnLineDrafts = {};
  for (const line of returnableLines) {
    drafts[line.goodsReceiptLineId] = { quantityReturned: '', reason: '', notes: '' };
  }
  return drafts;
}

/**
 * Same "worksheet, not freeform rows" shape as GoodsReceiptLineItemsEditor (Stage 5) —
 * a purchase return can only reference lines that already exist on the selected goods
 * receipt, so this renders one row per receipt line that still has a returnable
 * (not-yet-returned) quantity, with a quantity-to-return input, a reason, and notes.
 * Unlike every Money-carrying line editor in this module, there's no unit cost/currency
 * column at all — purchase returns are a physical record only, not a financial document
 * (see PurchaseReturnsService's own doc comment: "not a financial debit note"). Rows left
 * at 0 are excluded when the form builds the submitted DTO.
 */
export function PurchaseReturnLineItemsEditor({
  returnableLines,
  drafts,
  onChange,
}: {
  returnableLines: ReturnableReceiptLine[];
  drafts: PurchaseReturnLineDrafts;
  onChange: (drafts: PurchaseReturnLineDrafts) => void;
}) {
  const { t } = useTranslation();
  const variantIndex = useVariantIndex();

  function updateDraft(goodsReceiptLineId: string, patch: Partial<PurchaseReturnLineDraft>) {
    const current = drafts[goodsReceiptLineId] ?? { quantityReturned: '', reason: '', notes: '' };
    onChange({ ...drafts, [goodsReceiptLineId]: { ...current, ...patch } });
  }

  const returnable = returnableLines.filter((line) => line.remaining > 0);

  if (returnable.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('purchases.purchaseReturns.nothingReturnable')}</p>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('purchases.purchaseReturns.lineProduct')}</TableHead>
            <TableHead className="w-20">{t('purchases.purchaseReturns.lineReceived')}</TableHead>
            <TableHead className="w-20">{t('purchases.purchaseReturns.lineRemaining')}</TableHead>
            <TableHead className="w-32">{t('purchases.purchaseReturns.lineQuantityReturned')}</TableHead>
            <TableHead className="w-36">{t('purchases.purchaseReturns.lineReason')}</TableHead>
            <TableHead>{t('purchases.purchaseReturns.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {returnable.map((line) => {
            const draft = drafts[line.goodsReceiptLineId] ?? { quantityReturned: '', reason: '', notes: '' };
            const variant = variantIndex.get(line.productVariantId);
            return (
              <TableRow key={line.goodsReceiptLineId}>
                <TableCell>{variant ? `${variant.productName} — ${variant.sku}` : line.productVariantId}</TableCell>
                <TableCell>{line.received}</TableCell>
                <TableCell>{line.remaining}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    max={line.remaining}
                    step="any"
                    inputMode="decimal"
                    value={draft.quantityReturned}
                    onChange={(e) => updateDraft(line.goodsReceiptLineId, { quantityReturned: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={draft.reason}
                    onChange={(e) => updateDraft(line.goodsReceiptLineId, { reason: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={draft.notes}
                    onChange={(e) => updateDraft(line.goodsReceiptLineId, { notes: e.target.value })}
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
