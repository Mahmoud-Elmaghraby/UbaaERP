import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupplierPaymentWithAllocationsDto } from '@erp-platform/contracts';
import { Button, Separator, Skeleton, toast } from '@erp-platform/ui';

import { useAllocateSupplierPayment, useSupplierOutstandingInvoices } from '../../api/supplier-payments/queries';
import { ApiError } from '../../../../lib/api-client';
import { formatMoney } from '../../../../lib/money';
import {
  createEmptySupplierAllocationDraft,
  prepareSupplierAllocations,
  SupplierPaymentAllocationEditor,
  type SupplierAllocationDraft,
} from './supplier-payment-allocation-editor';

/** Applies a posted payment's unallocated remainder to more of the supplier's invoices. */
export function AllocateSupplierPaymentForm({
  payment,
  onDone,
}: {
  payment: SupplierPaymentWithAllocationsDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const allocatePayment = useAllocateSupplierPayment();
  const { data: outstanding, isLoading } = useSupplierOutstandingInvoices(payment.supplierId);
  const [drafts, setDrafts] = useState<SupplierAllocationDraft[]>(() => [createEmptySupplierAllocationDraft()]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const allocations = prepareSupplierAllocations(drafts, payment.amount.currency);
    if (allocations === null || allocations.length === 0) {
      setError(t('purchases.supplierPayments.allocationsError'));
      return;
    }
    try {
      await allocatePayment.mutateAsync({ id: payment.id, input: { allocations } });
      toast.success(t('purchases.supplierPayments.allocateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.supplierPayments.allocateError'));
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {t('purchases.supplierPayments.unallocatedAmount')}:{' '}
        <span className="font-medium text-foreground">
          {formatMoney(payment.unallocatedAmount.amountMinorUnits, payment.unallocatedAmount.currency)}
        </span>
      </p>
      <Separator />
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <SupplierPaymentAllocationEditor
          invoices={outstanding ?? []}
          currency={payment.amount.currency}
          drafts={drafts}
          onChange={setDrafts}
        />
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" disabled={allocatePayment.isPending} className="mt-2 justify-self-start" onClick={handleSubmit}>
        {t('common.save')}
      </Button>
    </div>
  );
}
