import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { CreateSupplierPaymentAllocationDto, SupplierOutstandingInvoiceDto } from '@erp-platform/contracts';
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

import { decimalToMinorUnits, formatMoney } from '../../../../lib/money';

export interface SupplierAllocationDraft {
  key: string;
  purchaseInvoiceId: string | undefined;
  /** Decimal string, converted with decimalToMinorUnits() on submit. */
  allocatedAmount: string;
}

let nextKey = 0;
export function createEmptySupplierAllocationDraft(): SupplierAllocationDraft {
  nextKey += 1;
  return { key: `new-${nextKey}`, purchaseInvoiceId: undefined, allocatedAmount: '' };
}

/** Untouched rows are dropped; returns null when a touched row is invalid. */
export function prepareSupplierAllocations(
  drafts: SupplierAllocationDraft[],
  currency: string,
): CreateSupplierPaymentAllocationDto[] | null {
  const touched = drafts.filter((d) => d.purchaseInvoiceId || d.allocatedAmount.trim() !== '');
  const prepared: CreateSupplierPaymentAllocationDto[] = [];
  for (const draft of touched) {
    if (!draft.purchaseInvoiceId) return null;
    let amountMinorUnits: string;
    try {
      amountMinorUnits = decimalToMinorUnits(draft.allocatedAmount);
    } catch {
      return null;
    }
    if (BigInt(amountMinorUnits) <= 0n) return null;
    prepared.push({ purchaseInvoiceId: draft.purchaseInvoiceId, allocatedAmount: { amountMinorUnits, currency } });
  }
  return prepared;
}

/**
 * Rows of (posted purchase invoice, amount) against the supplier's outstanding invoices.
 * Only invoices with something still owed (and in the payment's currency) are offered;
 * the outstanding figure is shown as a hint — the backend re-validates every cap.
 */
export function SupplierPaymentAllocationEditor({
  invoices,
  currency,
  drafts,
  onChange,
}: {
  invoices: SupplierOutstandingInvoiceDto[];
  currency: string;
  drafts: SupplierAllocationDraft[];
  onChange: (drafts: SupplierAllocationDraft[]) => void;
}) {
  const { t } = useTranslation();
  const open = invoices.filter(
    (invoice) => invoice.outstandingAmount.currency === currency && BigInt(invoice.outstandingAmount.amountMinorUnits) > 0n,
  );

  function updateDraft(key: string, patch: Partial<SupplierAllocationDraft>) {
    onChange(drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  }

  if (open.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('purchases.supplierPayments.noOutstandingInvoices')}</p>;
  }

  return (
    <div className="grid gap-2">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('purchases.supplierPayments.allocationInvoice')}</TableHead>
              <TableHead className="w-36">{t('purchases.supplierPayments.allocationAmount')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {drafts.map((draft) => {
              const usedElsewhere = new Set(drafts.filter((d) => d.key !== draft.key).map((d) => d.purchaseInvoiceId));
              const options = open.filter(
                (invoice) =>
                  !usedElsewhere.has(invoice.purchaseInvoiceId) || invoice.purchaseInvoiceId === draft.purchaseInvoiceId,
              );
              const selected = open.find((invoice) => invoice.purchaseInvoiceId === draft.purchaseInvoiceId);
              return (
                <TableRow key={draft.key}>
                  <TableCell>
                    <Select
                      value={draft.purchaseInvoiceId}
                      onValueChange={(value) => updateDraft(draft.key, { purchaseInvoiceId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('purchases.supplierPayments.selectInvoice')} />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((invoice) => (
                          <SelectItem key={invoice.purchaseInvoiceId} value={invoice.purchaseInvoiceId}>
                            {invoice.invoiceNumber} — {t('purchases.supplierPayments.outstanding')}{' '}
                            {formatMoney(invoice.outstandingAmount.amountMinorUnits, invoice.outstandingAmount.currency)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      placeholder={
                        selected
                          ? formatMoney(selected.outstandingAmount.amountMinorUnits, selected.outstandingAmount.currency)
                          : '0.00'
                      }
                      value={draft.allocatedAmount}
                      onChange={(e) => updateDraft(draft.key, { allocatedAmount: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('common.delete')}
                      onClick={() => onChange(drafts.filter((d) => d.key !== draft.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => onChange([...drafts, createEmptySupplierAllocationDraft()])}
      >
        <Plus className="me-1 h-4 w-4" />
        {t('purchases.supplierPayments.addAllocation')}
      </Button>
    </div>
  );
}
