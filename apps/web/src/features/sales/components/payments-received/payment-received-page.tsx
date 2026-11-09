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
import { CheckCircle2, FileQuestion, Landmark, Undo2 } from 'lucide-react';

import { useTreasuryLookup } from '../../../treasury/api/queries';
import { useCustomer } from '../../api/customers/queries';
import { useAllocatePaymentReceived, usePaymentReceived } from '../../api/payments-received/queries';
import { useSalesInvoiceRegister } from '../../api/sales-invoices/queries';
import { ApiError } from '../../../../lib/api-client';
import { formatDate } from '../../../../lib/format-date';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import {
  DocumentBody,
  DocumentHeaderBar,
  InfoGrid,
  SectionCard,
  TotalsPanel,
} from '../../../../components/document/document-layout';
import { DocumentHistory } from '../../../../components/document/document-history';
import { PrintButton } from '../../../../components/printing/print-button';
import {
  allocationsTotal,
  OpenInvoicesAllocation,
  prepareAllocations,
  type AllocationDrafts,
} from '../../../../components/document/open-invoices-allocation';
import { toOpenInvoiceRows } from './open-invoices-allocation';
import {
  PAYMENT_RECEIVED_STATUS_VARIANT,
  PAYMENTS_RECEIVED_PATH,
  paymentReceivedStatusLabelKey,
} from './payment-received-status';
import { usePaymentReceivedActions } from './use-payment-received-actions';
import { useTenantSettings } from '../../../settings/queries';
import { formatMoney } from '../../../../lib/money';
import { WhatsAppShareButton } from '../../../../components/document/whatsapp-share';
import { ChequeDueDate, ChequeStatusBadge } from '../../../../components/document/cheque-fields';
import { useChequeActions } from '../cheques/use-cheque-actions';
import { SALES, SALES_WRITE } from '../../../../lib/permissions';

/** /sales/payments-received/:id — a receipt, its allocations and (when posted) allocating what is left. */
export function PaymentReceivedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: payment, isLoading, isError } = usePaymentReceived(id);
  const { data: customer } = useCustomer(payment?.customerId);
  const { data: treasuries } = useTreasuryLookup();
  const { data: customerInvoices } = useSalesInvoiceRegister(
    { customerId: payment?.customerId },
    Boolean(payment?.customerId),
  );
  const actions = usePaymentReceivedActions();
  const { data: settings } = useTenantSettings();
  const allocate = useAllocatePaymentReceived();
  const chequeActions = useChequeActions();
  const [drafts, setDrafts] = useState<AllocationDrafts>({});
  const [allocateError, setAllocateError] = useState<string | null>(null);

  const invoiceById = useMemo(() => new Map((customerInvoices ?? []).map((row) => [row.id, row])), [customerInvoices]);

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
            <Link to={PAYMENTS_RECEIVED_PATH}>{t('documents.back')}</Link>
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
  const openInvoices = toOpenInvoiceRows(
    (customerInvoices ?? []).filter(
      (row) => row.status === 'posted' && row.currency === currency && BigInt(row.outstandingMinorUnits) > 0n,
    ),
  );
  const treasuryName = treasuries?.find((treasury) => treasury.id === payment.treasuryId)?.name;
  const cheque = payment.paymentMethod === 'check' ? payment.cheque : null;
  const chequeInHand = isPosted && cheque?.status === 'in_hand';
  const chequeTarget = { id: payment.id, currency, chequeNumber: cheque?.number ?? null };

  async function saveAllocation() {
    if (!payment) return;
    setAllocateError(null);
    const allocations = prepareAllocations(drafts, openInvoices, currency, unallocated);
    if (allocations === null || allocations.length === 0) {
      setAllocateError(t('sales.paymentsReceived.allocationsOverError'));
      return;
    }
    try {
      await allocate.mutateAsync({
        id: payment.id,
        input: { allocations: allocations.map((a) => ({ salesInvoiceId: a.invoiceId, allocatedAmount: a.allocatedAmount })) },
      });
      toast.success(t('sales.paymentsReceived.allocateSuccess'));
      setDrafts({});
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.paymentsReceived.allocateError'));
    }
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={PAYMENTS_RECEIVED_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('sales.tabs.paymentsReceived')}
        title={<span className="tabular">{payment.paymentNumber}</span>}
        status={
          <Badge variant={PAYMENT_RECEIVED_STATUS_VARIANT[payment.status]} dot>
            {t(paymentReceivedStatusLabelKey(payment.status))}
          </Badge>
        }
        actions={
          <>
            <PrintButton documentType="payment_received" id={payment.id} receipt />
            {payment.status !== 'cancelled' ? (
              <Can permission={SALES.view}>
                <WhatsAppShareButton
                  kind="payments-received"
                  documentId={payment.id}
                  phone={customer?.phone}
                  buildMessage={(url) =>
                    t('sales.whatsapp.paymentMessage', {
                      customer: customer?.name ?? '',
                      company: settings?.companyName ?? '',
                      number: payment.paymentNumber,
                      amount: formatMoney(payment.amount.amountMinorUnits, currency),
                      date: formatDate(payment.paymentDate ?? payment.createdAt),
                      url,
                    })
                  }
                />
              </Can>
            ) : null}
            <Can permission={SALES_WRITE}>
              {isDraft || payment.status === 'cancelled' ? (
                <Can permission={SALES.cancel}>
                  <Button
                    variant="ghost"
                    className="text-danger hover:bg-danger-soft hover:text-danger"
                    disabled={actions.isPending}
                    onClick={async () => {
                      if (await actions.remove(payment.id)) navigate(PAYMENTS_RECEIVED_PATH);
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </Can>
              ) : null}
              {chequeInHand ? (
                <>
                  <Can permission={SALES.post}>
                    <Button
                      variant="ghost"
                      className="text-danger hover:bg-danger-soft hover:text-danger"
                      onClick={() => chequeActions.open('bounce', chequeTarget)}
                    >
                      <Undo2 />
                      {t('cheques.actions.bounce')}
                    </Button>
                  </Can>
                  <Can permission={SALES.post}>
                    <Button onClick={() => chequeActions.open('collect', chequeTarget)}>
                      <Landmark />
                      {t('cheques.actions.collect')}
                    </Button>
                  </Can>
                </>
              ) : null}
              {isDraft ? (
                <>
                  <Can permission={SALES.cancel}>
                    <Button variant="outline" disabled={actions.isPending} onClick={() => void actions.cancel(payment.id)}>
                      {t('sales.paymentsReceived.cancel')}
                    </Button>
                  </Can>
                  <Can permission={SALES.post}>
                    <Button disabled={actions.isPending} onClick={() => void actions.post(payment.id)}>
                      <CheckCircle2 />
                      {t('sales.paymentsReceived.post')}
                    </Button>
                  </Can>
                </>
              ) : null}
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
                  { label: t('sales.paymentsReceived.customer'), value: customer?.name },
                  {
                    label: t('sales.paymentsReceived.paymentDate'),
                    value: <span className="tabular">{formatDate(payment.paymentDate ?? payment.createdAt)}</span>,
                  },
                  {
                    label: t('sales.paymentsReceived.paymentMethod'),
                    value: t(`sales.paymentsReceived.paymentMethodValue.${payment.paymentMethod}`),
                  },
                  ...(payment.treasuryId ? [{ label: t('treasury.select.label'), value: treasuryName ?? '—' }] : []),
                  ...(payment.referenceNumber
                    ? [
                        {
                          label: t('sales.paymentsReceived.referenceNumber'),
                          value: <span dir="ltr">{payment.referenceNumber}</span>,
                        },
                      ]
                    : []),
                  ...(payment.notes ? [{ label: t('documents.notes'), value: payment.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>

            {cheque ? (
              <SectionCard title={t('cheques.details')} actions={<ChequeStatusBadge status={cheque.status} />}>
                {payment.status === 'bounced' ? (
                  <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
                    {t('cheques.bouncedNotice', { date: formatDate(cheque.statusDate) })}
                  </p>
                ) : null}
                <InfoGrid
                  items={[
                    { label: t('cheques.number'), value: <span dir="ltr" className="tabular">{cheque.number ?? '—'}</span> },
                    { label: t('cheques.bank'), value: cheque.bank ?? '—' },
                    {
                      label: t('cheques.dueDate'),
                      value: (
                        <ChequeDueDate
                          dueDate={cheque.dueDate}
                          formatted={formatDate(cheque.dueDate)}
                          active={cheque.status === 'in_hand'}
                        />
                      ),
                    },
                    ...(cheque.status && cheque.status !== 'in_hand' && cheque.statusDate
                      ? [
                          {
                            label: t(`cheques.statusDateLabel.${cheque.status}`),
                            value: <span className="tabular">{formatDate(cheque.statusDate)}</span>,
                          },
                        ]
                      : []),
                    ...(cheque.status === 'endorsed' && cheque.endorsedToPaymentId
                      ? [
                          {
                            label: t('cheques.endorsedTo'),
                            value: (
                              <Link
                                to={`/purchases/supplier-payments/${cheque.endorsedToPaymentId}`}
                                className="text-primary hover:underline"
                              >
                                {t('cheques.viewSupplierPayment')}
                              </Link>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </SectionCard>
            ) : null}

            <SectionCard title={t('sales.paymentsReceived.allocations')} flush>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('sales.paymentsReceived.allocationInvoiceNumber')}</TableHead>
                    <TableHead>{t('sales.salesInvoices.invoiceDate')}</TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('sales.salesInvoices.outstanding')}</TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('sales.paymentsReceived.allocationAmount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payment.allocations.map((allocation) => {
                    const invoice = invoiceById.get(allocation.salesInvoiceId);
                    return (
                      <TableRow key={allocation.id}>
                        <TableCell>
                          <Link
                            to={`/sales/sales-invoices/${allocation.salesInvoiceId}`}
                            className="font-medium tabular-nums text-primary hover:underline"
                          >
                            {invoice?.invoiceNumber ?? '…'}
                          </Link>
                        </TableCell>
                        <TableCell className="tabular-nums">{formatDate(invoice?.invoiceDate)}</TableCell>
                        <TableCell className={AMOUNT_CELL}>
                          <Amount value={invoice?.outstandingMinorUnits} hideCurrency zeroAsDash />
                        </TableCell>
                        <TableCell className={`${AMOUNT_CELL} font-semibold`}>
                          <Amount value={allocation.allocatedAmount.amountMinorUnits} hideCurrency />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {payment.allocations.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                        {t('sales.paymentsReceived.noAllocations')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </SectionCard>

            {isPosted && unallocated > 0n ? (
              <Can permission={SALES_WRITE}>
                <SectionCard
                  title={t('sales.paymentsReceived.allocateRemainder')}
                  description={t('sales.paymentsReceived.allocateHint')}
                  actions={
                    <Can permission={SALES.post}>
                      <Button
                        type="button"
                        disabled={allocate.isPending || allocationsTotal(drafts) === 0n}
                        onClick={() => void saveAllocation()}
                      >
                        {t('sales.paymentsReceived.saveAllocation')}
                      </Button>
                    </Can>
                  }
                  flush
                >
                  <OpenInvoicesAllocation
                    invoices={openInvoices}
                    isLoading={!customerInvoices}
                    currency={currency}
                    drafts={drafts}
                    onChange={setDrafts}
                    available={unallocated}
                    emptyText={t('sales.paymentsReceived.noOpenInvoices')}
                  />
                  {allocateError ? <p className="px-5 pb-4 text-sm text-destructive">{allocateError}</p> : null}
                </SectionCard>
              </Can>
            ) : null}

          </>
        }
        side={
          <>
            <TotalsPanel
              title={t('documents.summary')}
              rows={[
                { label: t('sales.paymentsReceived.amount'), value: <Amount value={payment.amount.amountMinorUnits} hideCurrency /> },
                {
                  label: t('sales.paymentsReceived.allocatedTotal'),
                  value: <Amount value={allocatedMinor.toString()} hideCurrency zeroAsDash />,
                },
              ]}
              totalLabel={t('sales.paymentsReceived.unallocatedAmount')}
              totalValue={<Amount value={payment.unallocatedAmount.amountMinorUnits} hideCurrency />}
              currency={currency}
            />
            {customer ? (
              <SectionCard title={t('documents.partyDetails')}>
                <InfoGrid
                  items={[
                    { label: t('sales.paymentsReceived.customer'), value: customer.name, wide: true },
                    { label: t('documents.code'), value: <span className="tabular">{customer.code}</span>, wide: true },
                    ...(customer.phone
                      ? [{ label: t('documents.phone'), value: <span dir="ltr">{customer.phone}</span>, wide: true }]
                      : []),
                  ]}
                />
              </SectionCard>
            ) : null}
            <DocumentHistory entityType="payment_received" entityId={payment.id} />
          </>
        }
      />
      {chequeActions.dialog}
    </div>
  );
}
