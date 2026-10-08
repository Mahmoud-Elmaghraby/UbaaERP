import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupplierPaymentWithAllocationsDto } from '@erp-platform/contracts';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useSupplier } from '../../api/suppliers/queries';
import { useSupplierOutstandingInvoices } from '../../api/supplier-payments/queries';
import { useBankAccountLookup } from '../../../accounting/api/bank-accounts/queries';
import { formatMoney } from '../../../../lib/money';
import { SUPPLIER_PAYMENT_STATUS_VARIANT, supplierPaymentStatusLabelKey } from './supplier-payment-status';
import { PrintButton } from '../../../../components/printing/print-button';

/** Read-only header + allocations (invoice numbers resolved via the outstanding-invoices list), plus an actions slot. */
export function SupplierPaymentDetailsView({
  payment,
  actions,
}: {
  payment: SupplierPaymentWithAllocationsDto;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const { data: supplier } = useSupplier(payment.supplierId);
  const { data: bankAccounts } = useBankAccountLookup();
  const { data: invoices } = useSupplierOutstandingInvoices(payment.supplierId);
  const invoiceNumberById = useMemo(
    () => new Map((invoices ?? []).map((invoice) => [invoice.purchaseInvoiceId, invoice.invoiceNumber])),
    [invoices],
  );
  const bankName = bankAccounts?.find((account) => account.id === payment.bankAccountId)?.name;

  const fields: { label: string; value: ReactNode }[] = [
    { label: t('purchases.supplierPayments.paymentNumber'), value: payment.paymentNumber },
    {
      label: t('common.status'),
      value: (
        <Badge variant={SUPPLIER_PAYMENT_STATUS_VARIANT[payment.status]} dot>
          {t(supplierPaymentStatusLabelKey(payment.status))}
        </Badge>
      ),
    },
    { label: t('purchases.supplierPayments.supplier'), value: supplier?.name ?? '—' },
    {
      label: t('purchases.supplierPayments.paymentMethod'),
      value: t(`purchases.supplierPayments.paymentMethodValue.${payment.paymentMethod}`),
    },
    {
      label: t('purchases.supplierPayments.amount'),
      value: formatMoney(payment.amount.amountMinorUnits, payment.amount.currency),
    },
    {
      label: t('purchases.supplierPayments.unallocatedAmount'),
      value: formatMoney(payment.unallocatedAmount.amountMinorUnits, payment.unallocatedAmount.currency),
    },
    { label: t('purchases.supplierPayments.referenceNumber'), value: payment.referenceNumber ?? '—' },
    ...(payment.bankAccountId ? [{ label: t('payments.bankAccount'), value: bankName ?? '—' }] : []),
    { label: t('purchases.supplierPayments.paymentDate'), value: payment.paymentDate ?? '—' },
  ];

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <PrintButton documentType="supplier_payment" id={payment.id} receipt />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {fields.map((field) => (
          <div key={field.label}>
            <p className="text-muted-foreground">{field.label}</p>
            <div className="font-medium">{field.value}</div>
          </div>
        ))}
        <div className="col-span-2 sm:col-span-4">
          <p className="text-muted-foreground">{t('purchases.supplierPayments.notes')}</p>
          <p className="font-medium">{payment.notes ?? '—'}</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('purchases.supplierPayments.allocationInvoiceNumber')}</TableHead>
            <TableHead>{t('purchases.supplierPayments.allocationAmount')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payment.allocations.map((allocation) => (
            <TableRow key={allocation.id}>
              <TableCell className="tabular">
                {invoiceNumberById.get(allocation.purchaseInvoiceId) ?? allocation.purchaseInvoiceId}
              </TableCell>
              <TableCell>
                {formatMoney(allocation.allocatedAmount.amountMinorUnits, allocation.allocatedAmount.currency)}
              </TableCell>
            </TableRow>
          ))}
          {payment.allocations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2} className="py-6 text-center text-muted-foreground">
                {t('common.noResults')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      {actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}
    </div>
  );
}
