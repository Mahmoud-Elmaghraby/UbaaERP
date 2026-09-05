import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
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

import type { CustomerInvoiceOption } from '../../hooks/payments-received/use-customer-invoices';
import { formatMoney } from '../../../../lib/money';

export interface PaymentAllocationDraft {
  key: string;
  salesInvoiceId: string | undefined;
  /** Decimal string — converted to MoneyDto.amountMinorUnits via decimalToMinorUnits()
   * on submit, same convention as every Money-carrying line editor in this codebase. */
  allocatedAmount: string;
}

let nextKey = 0;
export function createEmptyAllocationDraft(): PaymentAllocationDraft {
  nextKey += 1;
  return { key: `new-${nextKey}`, salesInvoiceId: undefined, allocatedAmount: '' };
}

/**
 * Optional, freeform "allocate now" section on the Create form — rows are added/removed
 * like Quotations'/Sales Orders' own line editors (there's no fixed worksheet here the
 * way there is for Deliveries/Sales Invoices, since an invoice's true outstanding
 * balance isn't derivable client-side — see use-customer-invoices.ts's own comment for
 * why). Each row picks one of the customer's posted invoices (already-picked invoices
 * are excluded from later rows to prevent an accidental duplicate allocation to the same
 * invoice within one submission) and a decimal amount. The invoice's own totalAmount is
 * shown for reference only, not as a hard client-side cap — the backend is the sole
 * authority on how much of it is still outstanding.
 */
export function PaymentAllocationEditor({
  invoiceOptions,
  drafts,
  onChange,
}: {
  invoiceOptions: CustomerInvoiceOption[];
  drafts: PaymentAllocationDraft[];
  onChange: (drafts: PaymentAllocationDraft[]) => void;
}) {
  const { t } = useTranslation();

  function updateDraft(key: string, patch: Partial<PaymentAllocationDraft>) {
    onChange(drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  }

  function removeDraft(key: string) {
    onChange(drafts.filter((draft) => draft.key !== key));
  }

  function addDraft() {
    onChange([...drafts, createEmptyAllocationDraft()]);
  }

  if (invoiceOptions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('sales.paymentsReceived.noPostedInvoices')}</p>;
  }

  return (
    <div className="grid gap-2">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('sales.paymentsReceived.allocationInvoice')}</TableHead>
              <TableHead className="w-36">{t('sales.paymentsReceived.allocationAmount')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {drafts.map((draft) => {
              const usedElsewhere = new Set(
                drafts.filter((d) => d.key !== draft.key).map((d) => d.salesInvoiceId),
              );
              const availableOptions = invoiceOptions.filter(
                (option) => !usedElsewhere.has(option.invoice.id) || option.invoice.id === draft.salesInvoiceId,
              );
              const selected = invoiceOptions.find((option) => option.invoice.id === draft.salesInvoiceId);
              return (
                <TableRow key={draft.key}>
                  <TableCell>
                    <Select
                      value={draft.salesInvoiceId}
                      onValueChange={(value) => updateDraft(draft.key, { salesInvoiceId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('sales.paymentsReceived.selectInvoice')} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableOptions.map((option) => (
                          <SelectItem key={option.invoice.id} value={option.invoice.id}>
                            {option.invoice.invoiceNumber} — {option.soNumber} (
                            {formatMoney(option.totalAmount.amountMinorUnits, option.totalAmount.currency)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      placeholder={selected ? formatMoney(selected.totalAmount.amountMinorUnits, selected.totalAmount.currency) : '0.00'}
                      value={draft.allocatedAmount}
                      onChange={(e) => updateDraft(draft.key, { allocatedAmount: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeDraft(draft.key)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={addDraft}>
        <Plus className="me-1 h-4 w-4" />
        {t('sales.paymentsReceived.addAllocation')}
      </Button>
    </div>
  );
}
