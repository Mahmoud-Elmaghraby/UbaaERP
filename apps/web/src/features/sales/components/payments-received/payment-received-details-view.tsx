import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaymentReceivedWithAllocationsDto } from '@erp-platform/contracts';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { useCustomers } from '../../api/customers/queries';
import { formatMoney } from '../../../../lib/money';
import { useBankAccountLookup } from '../../../accounting/api/bank-accounts/queries';
import {
  PAYMENT_RECEIVED_STATUS_VARIANT,
  paymentReceivedStatusLabelKey,
} from './payment-received-status';
import { PrintButton } from '../../../../components/printing/print-button';

/** Read-only header + allocations, same overall shape as every other Sales entity's
 * details view — plus unallocatedAmount, which only this entity has (server-computed,
 * never stored, same "derive on read" precedent as every totalAmount elsewhere). */
export function PaymentReceivedDetailsView({
  payment,
}: {
  payment: PaymentReceivedWithAllocationsDto;
}) {
  const { t } = useTranslation();
  const { data: bankAccounts } = useBankAccountLookup();
  const bankName = bankAccounts?.find((account) => account.id === payment.bankAccountId)?.name;
  const { data: customers } = useCustomers();

  const customerById = useMemo(() => new Map((customers ?? []).map((c) => [c.id, c])), [customers]);

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <PrintButton documentType="payment_received" id={payment.id} receipt />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">{t('sales.paymentsReceived.paymentNumber')}</p>
          <p className="font-medium">{payment.paymentNumber}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('common.status')}</p>
          <Badge variant={PAYMENT_RECEIVED_STATUS_VARIANT[payment.status]} dot>
            {t(paymentReceivedStatusLabelKey(payment.status))}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.paymentsReceived.customer')}</p>
          <p className="font-medium">{customerById.get(payment.customerId)?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.paymentsReceived.paymentMethod')}</p>
          <p className="font-medium">
            {t(`sales.paymentsReceived.paymentMethodValue.${payment.paymentMethod}`)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.paymentsReceived.amount')}</p>
          <p className="font-medium">
            {formatMoney(payment.amount.amountMinorUnits, payment.amount.currency)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.paymentsReceived.unallocatedAmount')}</p>
          <p className="font-medium">
            {formatMoney(
              payment.unallocatedAmount.amountMinorUnits,
              payment.unallocatedAmount.currency,
            )}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('sales.paymentsReceived.referenceNumber')}</p>
          <p className="font-medium">{payment.referenceNumber ?? '—'}</p>
        </div>
        {payment.bankAccountId ? (
          <div>
            <p className="text-muted-foreground">{t('payments.bankAccount')}</p>
            <p className="font-medium">{bankName ?? '—'}</p>
          </div>
        ) : null}
        <div>
          <p className="text-muted-foreground">{t('sales.paymentsReceived.paymentDate')}</p>
          <p className="font-medium">{payment.paymentDate ?? '—'}</p>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <p className="text-muted-foreground">{t('sales.paymentsReceived.notes')}</p>
          <p className="font-medium">{payment.notes ?? '—'}</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('sales.paymentsReceived.allocationInvoiceNumber')}</TableHead>
            <TableHead>{t('sales.paymentsReceived.allocationAmount')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payment.allocations.map((allocation) => (
            <TableRow key={allocation.id}>
              <TableCell>{allocation.salesInvoiceId}</TableCell>
              <TableCell>
                {formatMoney(
                  allocation.allocatedAmount.amountMinorUnits,
                  allocation.allocatedAmount.currency,
                )}
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
    </div>
  );
}
