import { useTranslation } from 'react-i18next';
import { Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useVariantIndex } from '../../hooks/purchase-invoices/use-variant-index';
import type { InvoiceablePoLine } from '../../hooks/purchase-invoices/use-purchase-order-invoiceable';
import { formatMoney } from '../../../../lib/money';

export interface PurchaseInvoiceLineDraft {
  quantityInvoiced: string;
  /** Decimal string override — blank means "use the purchase order line's own price",
   * applied server-side (createPurchaseInvoiceLineSchema.unitPrice is optional), same
   * convention as the receiving worksheet's unitCost override in Goods Receipts. */
  unitPrice: string;
  notes: string;
}

export type PurchaseInvoiceLineDrafts = Record<string, PurchaseInvoiceLineDraft>;

export function createEmptyPurchaseInvoiceDrafts(invoiceableLines: InvoiceablePoLine[]): PurchaseInvoiceLineDrafts {
  const drafts: PurchaseInvoiceLineDrafts = {};
  for (const line of invoiceableLines) {
    drafts[line.purchaseOrderLineId] = { quantityInvoiced: '', unitPrice: '', notes: '' };
  }
  return drafts;
}

/**
 * Same "worksheet, not freeform rows" shape as GoodsReceiptLineItemsEditor (Stage 5) and
 * PurchaseReturnLineItemsEditor (Stage 6) — an invoice can only reference lines that
 * already exist on the selected purchase order. Renders one row per PO line that still
 * has an invoiceable (not-yet-invoiced) quantity, with a quantity-to-invoice input and an
 * optional unit price override (blank = the PO line's own price, applied server-side).
 * Unlike Goods Receipts/Purchase Returns, this entity DOES carry Money, so the override
 * behaves like the manual Purchase Order line editor's price field — but every line is
 * still implicitly the same currency as the PO itself (assertSingleCurrency() re-checked
 * server-side), so there's still no per-line currency picker. Rows left at 0 are excluded
 * when the form builds the submitted DTO.
 */
export function PurchaseInvoiceLineItemsEditor({
  invoiceableLines,
  drafts,
  onChange,
}: {
  invoiceableLines: InvoiceablePoLine[];
  drafts: PurchaseInvoiceLineDrafts;
  onChange: (drafts: PurchaseInvoiceLineDrafts) => void;
}) {
  const { t } = useTranslation();
  const variantIndex = useVariantIndex();

  function updateDraft(purchaseOrderLineId: string, patch: Partial<PurchaseInvoiceLineDraft>) {
    const current = drafts[purchaseOrderLineId] ?? { quantityInvoiced: '', unitPrice: '', notes: '' };
    onChange({ ...drafts, [purchaseOrderLineId]: { ...current, ...patch } });
  }

  const invoiceable = invoiceableLines.filter((line) => line.remaining > 0);

  if (invoiceable.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('purchases.purchaseInvoices.nothingInvoiceable')}</p>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('purchases.purchaseInvoices.lineProduct')}</TableHead>
            <TableHead className="w-20">{t('purchases.purchaseInvoices.lineOrdered')}</TableHead>
            <TableHead className="w-20">{t('purchases.purchaseInvoices.lineRemaining')}</TableHead>
            <TableHead className="w-32">{t('purchases.purchaseInvoices.lineQuantityInvoiced')}</TableHead>
            <TableHead className="w-36">{t('purchases.purchaseInvoices.lineUnitPrice')}</TableHead>
            <TableHead>{t('purchases.purchaseInvoices.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoiceable.map((line) => {
            const draft = drafts[line.purchaseOrderLineId] ?? { quantityInvoiced: '', unitPrice: '', notes: '' };
            const variant = variantIndex.get(line.productVariantId);
            return (
              <TableRow key={line.purchaseOrderLineId}>
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
                    value={draft.quantityInvoiced}
                    onChange={(e) => updateDraft(line.purchaseOrderLineId, { quantityInvoiced: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    inputMode="decimal"
                    placeholder={formatMoney(line.unitPrice.amountMinorUnits, line.unitPrice.currency)}
                    value={draft.unitPrice}
                    onChange={(e) => updateDraft(line.purchaseOrderLineId, { unitPrice: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={draft.notes}
                    onChange={(e) => updateDraft(line.purchaseOrderLineId, { notes: e.target.value })}
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
