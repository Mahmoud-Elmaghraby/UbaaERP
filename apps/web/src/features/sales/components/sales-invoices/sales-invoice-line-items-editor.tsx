import { useTranslation } from 'react-i18next';
import { Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useVariantIndex } from '../../hooks/sales-invoices/use-variant-index';
import type { InvoiceableSoLine } from '../../hooks/sales-invoices/use-sales-order-invoiceable';
import { decimalToMinorUnits, formatAmount, multiplyMinorUnits } from '../../../../lib/money';

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

/** Preview of one worksheet row's amount in minor units (null when the row is empty
 * or not a valid number yet). Display only — the server computes the real total. */
export function previewSoLineAmount(
  line: InvoiceableSoLine,
  draft: SalesInvoiceLineDraft | undefined,
): string | null {
  if (!draft || draft.quantityInvoiced.trim() === '') return null;
  const quantity = Number(draft.quantityInvoiced);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  let priceMinor = line.unitPrice.amountMinorUnits;
  if (draft.unitPrice.trim() !== '') {
    try {
      priceMinor = decimalToMinorUnits(draft.unitPrice);
    } catch {
      return null;
    }
  }
  return multiplyMinorUnits(priceMinor, draft.quantityInvoiced.trim());
}

/**
 * Same "worksheet, not freeform rows" shape as Purchases' PurchaseInvoiceLineItemsEditor
 * — an invoice can only reference lines that already exist on the selected sales order.
 * Renders one row per order line that still has an invoiceable (not-yet-invoiced)
 * quantity, with a quantity-to-invoice input and an optional unit price override (blank
 * = the order line's own price, applied server-side). Every line is implicitly the same
 * currency as the sales order itself (assertSingleCurrency() re-checked server-side), so
 * there's no per-line currency picker. Rows left empty are excluded when the form builds
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
    return (
      <p className="px-5 pb-5 text-sm text-muted-foreground">{t('sales.salesInvoices.nothingInvoiceable')}</p>
    );
  }

  return (
    <Table className="min-w-[760px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{t('sales.salesInvoices.lineProduct')}</TableHead>
          <TableHead className="w-20 text-end">{t('sales.salesInvoices.lineOrdered')}</TableHead>
          <TableHead className="w-20 text-end">{t('sales.salesInvoices.lineRemaining')}</TableHead>
          <TableHead className="w-32">{t('sales.salesInvoices.lineQuantityInvoiced')}</TableHead>
          <TableHead className="w-36">{t('documents.unitPrice')}</TableHead>
          <TableHead className="w-32 text-end">{t('documents.lineTotal')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoiceable.map((line) => {
          const draft = drafts[line.salesOrderLineId] ?? { quantityInvoiced: '', unitPrice: '', notes: '' };
          const variant = variantIndex.get(line.productVariantId);
          const amount = previewSoLineAmount(line, draft);
          return (
            <TableRow key={line.salesOrderLineId}>
              <TableCell>
                <div className="flex flex-col gap-1 py-1">
                  <span className="font-medium leading-snug">
                    {variant?.productName ?? line.productVariantId}
                  </span>
                  <span className="text-xs text-muted-foreground">{variant?.sku}</span>
                  <Input
                    className="h-8 text-xs"
                    placeholder={t('sales.salesInvoices.lineNotes')}
                    aria-label={t('sales.salesInvoices.lineNotes')}
                    value={draft.notes}
                    onChange={(e) => updateDraft(line.salesOrderLineId, { notes: e.target.value })}
                  />
                </div>
              </TableCell>
              <TableCell className="text-end text-secondary-foreground">{line.ordered}</TableCell>
              <TableCell className="text-end">
                <button
                  type="button"
                  className="tabular rounded px-1 font-medium text-brand-700 underline-offset-2 hover:underline dark:text-primary"
                  title={t('sales.salesInvoices.lineQuantityInvoiced')}
                  onClick={() =>
                    updateDraft(line.salesOrderLineId, { quantityInvoiced: String(line.remaining) })
                  }
                >
                  {line.remaining}
                </button>
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={0}
                  max={line.remaining}
                  step="any"
                  inputMode="decimal"
                  className="h-9 text-end"
                  aria-label={t('sales.salesInvoices.lineQuantityInvoiced')}
                  value={draft.quantityInvoiced}
                  onChange={(e) => updateDraft(line.salesOrderLineId, { quantityInvoiced: e.target.value })}
                />
              </TableCell>
              <TableCell>
                <Input
                  inputMode="decimal"
                  className="h-9 text-end"
                  aria-label={t('documents.unitPrice')}
                  title={t('documents.orderPriceHint')}
                  placeholder={formatAmount(line.unitPrice.amountMinorUnits)}
                  value={draft.unitPrice}
                  onChange={(e) => updateDraft(line.salesOrderLineId, { unitPrice: e.target.value })}
                />
              </TableCell>
              <TableCell className="text-end font-semibold">
                {amount ? formatAmount(amount) : <span className="text-muted-foreground">—</span>}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
