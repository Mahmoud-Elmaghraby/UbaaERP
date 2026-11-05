import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupplierPaymentWithAllocationsDto } from '@erp-platform/contracts';
import { Badge, Button, Can, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useSupplier } from '../../api/suppliers/queries';
import { useSupplierOutstandingInvoices } from '../../api/supplier-payments/queries';
import { useTreasuryLookup } from '../../../treasury/api/queries';
import { formatMoney } from '../../../../lib/money';
import { SUPPLIER_PAYMENT_STATUS_VARIANT, supplierPaymentStatusLabelKey } from './supplier-payment-status';
import { PrintButton } from '../../../../components/printing/print-button';
import { ChequeDueDate, ChequeStatusBadge } from '../../../../components/document/cheque-fields';
import { formatDate } from '../../../../lib/format-date';
import { useChequeActions } from '../../../sales/components/cheques/use-cheque-actions';

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
  const { data: treasuries } = useTreasuryLookup();
  const { data: invoices } = useSupplierOutstandingInvoices(payment.supplierId);
  const invoiceNumberById = useMemo(
    () => new Map((invoices ?? []).map((invoice) => [invoice.purchaseInvoiceId, invoice.invoiceNumber])),
    [invoices],
  );
  const treasuryName = treasuries?.find((treasury) => treasury.id === payment.treasuryId)?.name;
  const chequeActions = useChequeActions();
  const cheque = payment.cheque;
  const chequeOutstanding = payment.status === 'posted' && cheque?.status === 'issued';

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
    ...(payment.treasuryId ? [{ label: t('treasury.select.label'), value: treasuryName ?? '—' }] : []),
    { label: t('purchases.supplierPayments.paymentDate'), value: payment.paymentDate ?? '—' },
    ...(payment.endorsedChequeId ? [{ label: t('cheques.endorsedCheque'), value: t('cheques.mode.endorse') }] : []),
  ];
  const chequeFields: { label: string; value: ReactNode }[] = cheque
    ? [
        { label: t('cheques.number'), value: <span dir="ltr">{cheque.number ?? '—'}</span> },
        { label: t('cheques.bank'), value: cheque.bank ?? treasuryName ?? '—' },
        {
          label: t('cheques.dueDate'),
          value: <ChequeDueDate dueDate={cheque.dueDate} formatted={formatDate(cheque.dueDate)} active={cheque.status === 'issued'} />,
        },
        {
          label: t('common.status'),
          value: (
            <span className="flex flex-wrap items-center gap-1.5">
              <ChequeStatusBadge status={cheque.status} />
              {cheque.status === 'cleared' && cheque.statusDate ? (
                <span className="text-xs text-muted-foreground">{formatDate(cheque.statusDate)}</span>
              ) : null}
            </span>
          ),
        },
      ]
    : [];

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

      {cheque ? (
        <div className="grid gap-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{t('cheques.details')}</p>
            {chequeOutstanding ? (
              <Can permission="purchases.manage">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    chequeActions.open('clear', {
                      id: payment.id,
                      currency: payment.amount.currency,
                      chequeNumber: cheque.number,
                    })
                  }
                >
                  {t('cheques.actions.clear')}
                </Button>
              </Can>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {chequeFields.map((field) => (
              <div key={field.label}>
                <p className="text-muted-foreground">{field.label}</p>
                <div className="font-medium">{field.value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {chequeActions.dialog}

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
