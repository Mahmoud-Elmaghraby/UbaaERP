import { useTranslation } from 'react-i18next';
import { Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useVariantIndex } from '../../hooks/sales-invoices/use-variant-index';
import type { InvoiceableSoLine } from '../../hooks/sales-invoices/use-sales-order-invoiceable';
import { formatMoney } from '../../../../lib/money';

export interface SalesInvoiceLineDraft {
  quantityInvoiced: string;
  /** Decimal string override — blank means "use the sales order line's own price",
   * applied server-side (createSalesInvoiceLineSchema.unitPrice is optional), same
   * convention as Purchase Invoices' own line editor. */
  unitPrice: string;
  notes: string;
}

export type SalesInvoiceLineDrafts = Record<string, SalesInvoiceLineDraft>;

export function createEmptySalesInvoiceDrafts(invoiceableLines: InvoiceableSoLine[]): SalesInvoiceLineDrafts {
  const drafts: SalesInvoiceLineDrafts = {};
  for (const line of invoiceableLines) {
    drafts[line.salesOrderLineId] = { quantityInvoiced: '', unitPrice: '', notes: '' };
  }
  return drafts;
}

/**
 * Same "worksheet, not freeform rows" shape as Purchases' PurchaseInvoiceLineItemsEditor
 * — an invoice can only reference lines that already exist on the selected sales order.
 * Renders one row per order line that still has an invoiceable (not-yet-invoiced)
 * quantity, with a quantity-to-invoice input and an optional unit price override (blank
 * = the order line's own price, applied server-side). Every line is implicitly the same
 * currency as the sales order itself (assertSingleCurrency() re-checked server-side), so
 * there's no per-line currency picker. Rows left at 0 are excluded when the form builds
 * the submitted DTO.
 */
export function SalesInvoiceLineItemsEditor({
  invoiceableLines,
  drafts,
  onChange,
}: {
  invoiceableLines: InvoiceableSoLine[];
  drafts: SalesInvoiceLineDrafts;
  onChange: (drafts: SalesInvoiceLineDrafts) => void;
}) {
  const { t } = useTranslation();
  const variantIndex = useVariantIndex();

  function updateDraft(salesOrderLineId: string, patch: Partial<SalesInvoiceLineDraft>) {
    const current = drafts[salesOrderLineId] ?? { quantityInvoiced: '', unitPrice: '', notes: '' };
    onChange({ ...drafts, [salesOrderLineId]: { ...current, ...patch } });
  }

  const invoiceable = invoiceableLines.filter((line) => line.remaining > 0);

  if (invoiceable.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('sales.salesInvoices.nothingInvoiceable')}</p>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('sales.salesInvoices.lineProduct')}</TableHead>
            <TableHead className="w-20">{t('sales.salesInvoices.lineOrdered')}</TableHead>
            <TableHead className="w-20">{t('sales.salesInvoices.lineRemaining')}</TableHead>
            <TableHead className="w-32">{t('sales.salesInvoices.lineQuantityInvoiced')}</TableHead>
            <TableHead className="w-36">{t('sales.salesInvoices.lineUnitPrice')}</TableHead>
            <TableHead>{t('sales.salesInvoices.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoiceable.map((line) => {
            const draft = drafts[line.salesOrderLineId] ?? { quantityInvoiced: '', unitPrice: '', notes: '' };
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
                    value={draft.quantityInvoiced}
                    onChange={(e) => updateDraft(line.salesOrderLineId, { quantityInvoiced: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    inputMode="decimal"
                    placeholder={formatMoney(line.unitPrice.amountMinorUnits, line.unitPrice.currency)}
                    value={draft.unitPrice}
                    onChange={(e) => updateDraft(line.salesOrderLineId, { unitPrice: e.target.value })}
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
