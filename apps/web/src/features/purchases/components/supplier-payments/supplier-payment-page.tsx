import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Can,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';
import { Ban, CheckCircle2, FileQuestion, Trash2 } from 'lucide-react';

import { useSupplier } from '../../api/suppliers/queries';
import { usePurchaseInvoices } from '../../api/purchase-invoices/queries';
import {
  useAllocateSupplierPayment,
  useSupplierOutstandingInvoices,
  useSupplierPayment,
} from '../../api/supplier-payments/queries';
import { useTreasuryLookup } from '../../../treasury/api/queries';
import { useChequeActions } from '../../../sales/components/cheques/use-cheque-actions';
import { toSupplierOpenRows } from '../../lib/supplier-open-invoices';
import { ApiError } from '../../../../lib/api-client';
import { formatDate } from '../../../../lib/format-date';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { ChequeDueDate, ChequeStatusBadge } from '../../../../components/document/cheque-fields';
import {
  DocumentBody,
  DocumentHeaderBar,
  InfoGrid,
  SectionCard,
  TotalsPanel,
} from '../../../../components/document/document-layout';
import { DocumentHistory } from '../../../../components/document/document-history';
import {
  allocationsTotal,
  OpenInvoicesAllocation,
  prepareAllocations,
  type AllocationDrafts,
} from '../../../../components/document/open-invoices-allocation';
import { PrintButton } from '../../../../components/printing/print-button';
import { SUPPLIER_PAYMENT_STATUS_VARIANT, SUPPLIER_PAYMENTS_PATH, supplierPaymentStatusLabelKey } from './supplier-payment-status';
import { useSupplierPaymentActions } from './use-supplier-payment-actions';

const PURCHASE_INVOICES_PATH = '/purchases/purchase-invoices';
const SUPPLIERS_PATH = '/purchases/suppliers';

/** /purchases/supplier-payments/:id — the payment, post/cancel/delete, its allocations and allocating the rest. */
export function SupplierPaymentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: payment, isLoading, isError } = useSupplierPayment(id);
  const { data: supplier } = useSupplier(payment?.supplierId);
  const { data: treasuries } = useTreasuryLookup();
  const { data: invoices } = usePurchaseInvoices();
  const { data: outstanding } = useSupplierOutstandingInvoices(payment?.status === 'posted' ? payment.supplierId : null);
  const actions = useSupplierPaymentActions();
  const allocate = useAllocateSupplierPayment();
  const chequeActions = useChequeActions();
  const [drafts, setDrafts] = useState<AllocationDrafts>({});
  const [allocateError, setAllocateError] = useState<string | null>(null);

  const invoiceNumberById = useMemo(() => new Map((invoices ?? []).map((i) => [i.id, i.invoiceNumber])), [invoices]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !payment) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={SUPPLIER_PAYMENTS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const currency = payment.amount.currency;
  const isDraft = payment.status === 'draft';
  const isPosted = payment.status === 'posted';
  const unallocated = BigInt(payment.unallocatedAmount.amountMinorUnits);
  const allocatedMinor = BigInt(payment.amount.amountMinorUnits) - unallocated;
  const openRows = toSupplierOpenRows(outstanding ?? [], currency);
  const treasuryName = treasuries?.find((treasury) => treasury.id === payment.treasuryId)?.name;
  const cheque = payment.cheque;
  const chequeOutstanding = isPosted && cheque?.status === 'issued';

  async function saveAllocation() {
    if (!payment) return;
    setAllocateError(null);
    const allocations = prepareAllocations(drafts, openRows, currency, unallocated);
    if (allocations === null || allocations.length === 0) {
      setAllocateError(t('purchases.supplierPayments.allocationsOverError'));
      return;
    }
    try {
      await allocate.mutateAsync({
        id: payment.id,
        input: { allocations: allocations.map((a) => ({ purchaseInvoiceId: a.invoiceId, allocatedAmount: a.allocatedAmount })) },
      });
      toast.success(t('purchases.supplierPayments.allocateSuccess'));
      setDrafts({});
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.supplierPayments.allocateError'));
    }
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={SUPPLIER_PAYMENTS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('purchases.tabs.supplierPayments')}
        title={<span className="tabular">{payment.paymentNumber}</span>}
        status={
          <Badge variant={SUPPLIER_PAYMENT_STATUS_VARIANT[payment.status]} dot>
            {t(supplierPaymentStatusLabelKey(payment.status))}
          </Badge>
        }
        actions={
          <>
            <PrintButton documentType="supplier_payment" id={payment.id} receipt />
            <Can permission="purchases.manage">
              <>
                {isDraft || payment.status === 'cancelled' ? (
                  <Button
                    variant="ghost"
                    className="text-danger hover:bg-danger-soft hover:text-danger"
                    disabled={actions.isPending}
                    onClick={async () => {
                      if (await actions.remove(payment.id)) navigate(SUPPLIER_PAYMENTS_PATH, { replace: true });
                    }}
                  >
                    <Trash2 />
                    {t('common.delete')}
                  </Button>
                ) : null}
                {isDraft ? (
                  <>
                    <Button variant="outline" disabled={actions.isPending} onClick={() => void actions.cancel(payment.id)}>
                      <Ban />
                      {t('purchases.supplierPayments.cancel')}
                    </Button>
                    <Button disabled={actions.isPending} onClick={() => void actions.post(payment.id)}>
                      <CheckCircle2 />
                      {t('purchases.supplierPayments.post')}
                    </Button>
                  </>
                ) : null}
                {chequeOutstanding && cheque ? (
                  <Button
                    variant="outline"
                    onClick={() => chequeActions.open('clear', { id: payment.id, currency, chequeNumber: cheque.number })}
                  >
                    {t('cheques.actions.clear')}
                  </Button>
                ) : null}
              </>
            </Can>
          </>
        }
      />

      <DocumentBody
        main={
          <>
            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  {
                    label: t('purchases.supplierPayments.supplier'),
                    value: supplier ? (
                      <Link className="text-primary hover:underline" to={`${SUPPLIERS_PATH}/${supplier.id}`}>
                        {supplier.name}
                      </Link>
                    ) : undefined,
                  },
                  {
                    label: t('purchases.supplierPayments.paymentDate'),
                    value: <span className="tabular">{formatDate(payment.paymentDate ?? payment.createdAt)}</span>,
                  },
                  {
                    label: t('purchases.supplierPayments.paymentMethod'),
                    value: t(`purchases.supplierPayments.paymentMethodValue.${payment.paymentMethod}`),
                  },
                  ...(payment.treasuryId ? [{ label: t('treasury.select.label'), value: treasuryName ?? '—' }] : []),
                  ...(payment.referenceNumber
                    ? [{ label: t('purchases.supplierPayments.referenceNumber'), value: <span dir="ltr">{payment.referenceNumber}</span> }]
                    : []),
                  ...(payment.endorsedChequeId ? [{ label: t('cheques.endorsedCheque'), value: t('cheques.mode.endorse') }] : []),
                  ...(payment.notes ? [{ label: t('documents.notes'), value: payment.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>

            {cheque ? (
              <SectionCard title={t('cheques.details')}>
                <InfoGrid
                  items={[
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
                  ]}
                />
              </SectionCard>
            ) : null}

            <SectionCard title={t('purchases.supplierPayments.allocations')} flush>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('documents.allocation.invoiceNumber')}</TableHead>
                    <TableHead className="text-end">{t('documents.allocation.amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payment.allocations.map((allocation) => (
                    <TableRow key={allocation.id}>
                      <TableCell>
                        <Link
                          className="tabular text-primary hover:underline"
                          to={`${PURCHASE_INVOICES_PATH}/${allocation.purchaseInvoiceId}`}
                        >
                          {invoiceNumberById.get(allocation.purchaseInvoiceId) ?? '…'}
                        </Link>
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={allocation.allocatedAmount.amountMinorUnits} hideCurrency />
                      </TableCell>
                    </TableRow>
                  ))}
                  {payment.allocations.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={2} className="h-16 text-center text-muted-foreground">
                        {t('purchases.supplierPayments.noAllocations')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </SectionCard>

            {isPosted && unallocated > 0n ? (
              <Can permission="purchases.manage">
                <SectionCard
                  title={t('purchases.supplierPayments.allocateRest')}
                  actions={
                    <Button size="sm" disabled={allocate.isPending || allocationsTotal(drafts) === 0n} onClick={() => void saveAllocation()}>
                      {t('purchases.supplierPayments.saveAllocation')}
                    </Button>
                  }
                  flush
                >
                  <OpenInvoicesAllocation
                    invoices={openRows}
                    isLoading={!outstanding}
                    currency={currency}
                    drafts={drafts}
                    onChange={setDrafts}
                    available={unallocated}
                    emptyText={t('purchases.supplierPayments.noOutstandingInvoices')}
                  />
                  {allocateError ? <p className="px-5 pb-4 text-sm text-destructive">{allocateError}</p> : null}
                </SectionCard>
              </Can>
            ) : null}
            {chequeActions.dialog}
          </>
        }
        side={
          <>
            <TotalsPanel
              title={t('documents.summary')}
              rows={[
                { label: t('documents.allocation.allocatedTotal'), value: <Amount value={allocatedMinor.toString()} hideCurrency zeroAsDash /> },
                { label: t('purchases.supplierPayments.unallocatedAmount'), value: <Amount value={unallocated.toString()} hideCurrency zeroAsDash /> },
              ]}
              totalLabel={t('purchases.supplierPayments.amount')}
              totalValue={<Amount value={payment.amount.amountMinorUnits} hideCurrency />}
              currency={currency}
            />
            <DocumentHistory entityType="supplier_payment" entityId={payment.id} />
          </>
        }
      />
    </div>
  );
}
