import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AllocatePaymentReceivedDto, PaymentReceivedWithAllocationsDto } from '@erp-platform/contracts';
import { Button, Separator, Skeleton, toast } from '@erp-platform/ui';

import { useAllocatePaymentReceived } from '../../api/payments-received/queries';
import { useCustomerInvoices } from '../../hooks/payments-received/use-customer-invoices';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits, formatMoney } from '../../../../lib/money';
import {
  createEmptyAllocationDraft,
  PaymentAllocationEditor,
  type PaymentAllocationDraft,
} from './payment-allocation-editor';

/**
 * The dedicated "allocate" action — applies a posted payment's unallocated remainder to
 * one or more additional sales invoices (PaymentsReceivedService.allocate(), the gap
 * the backend's own class comment used to flag as deferred). Only offered for a posted
 * payment (see payments-received-tab.tsx's own status gating). The payment's
 * unallocatedAmount is shown for reference; like the Create form's allocation section,
 * the per-invoice cap is not enforced client-side (no endpoint exposes an invoice's true
 * outstanding balance — see use-customer-invoices.ts), only the sum entered here against
 * this payment's own unallocatedAmount, which the backend re-validates independently.
 */
export function AllocatePaymentReceivedForm({
  payment,
  onDone,
}: {
  payment: PaymentReceivedWithAllocationsDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const allocatePayment = useAllocatePaymentReceived();
  const { invoiceOptions, isLoading: invoiceOptionsLoading } = useCustomerInvoices(payment.customerId);
  const [drafts, setDrafts] = useState<PaymentAllocationDraft[]>(() => [createEmptyAllocationDraft()]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const touched = drafts.filter((d) => d.salesInvoiceId && d.allocatedAmount.trim() !== '');
    if (touched.length === 0) {
      setError(t('sales.paymentsReceived.allocationsError'));
      return;
    }
    const allocations: AllocatePaymentReceivedDto['allocations'] = [];
    for (const draft of touched) {
      if (!draft.salesInvoiceId) {
        setError(t('sales.paymentsReceived.allocationsError'));
        return;
      }
      let amountMinorUnits: string;
      try {
        amountMinorUnits = decimalToMinorUnits(draft.allocatedAmount);
      } catch {
        setError(t('sales.paymentsReceived.allocationsError'));
        return;
      }
      if (BigInt(amountMinorUnits) <= 0n) {
        setError(t('sales.paymentsReceived.allocationsError'));
        return;
      }
      allocations.push({
        salesInvoiceId: draft.salesInvoiceId,
        allocatedAmount: { amountMinorUnits, currency: payment.amount.currency },
      });
    }
    try {
      await allocatePayment.mutateAsync({ id: payment.id, input: { allocations } });
      toast.success(t('sales.paymentsReceived.allocateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.paymentsReceived.allocateError'));
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {t('sales.paymentsReceived.unallocatedAmount')}:{' '}
        <span className="font-medium text-foreground">
          {formatMoney(payment.unallocatedAmount.amountMinorUnits, payment.unallocatedAmount.currency)}
        </span>
      </p>
      <Separator />
      {invoiceOptionsLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <PaymentAllocationEditor invoiceOptions={invoiceOptions} drafts={drafts} onChange={setDrafts} />
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" disabled={allocatePayment.isPending} className="mt-2 justify-self-start" onClick={handleSubmit}>
        {t('common.save')}
      </Button>
    </div>
  );
}
