import { useMemo } from 'react';
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
  useHasFeature,
} from '@erp-platform/ui';
import { CheckCircle2, FileQuestion, Info, Wallet } from 'lucide-react';

import { AttachmentsPanel } from '../../../attachments/components/attachments-panel';
import { useCustomer, useCustomerCreditCheck } from '../../api/customers/queries';
import { CreditLimitCallout, confirmCreditLimit, isCreditBlocked } from '../../lib/credit-limit';
import { useDeliveriesBySalesOrder } from '../../api/deliveries/queries';
import { usePaymentReceivedRegister } from '../../api/payments-received/queries';
import { useQuotation } from '../../api/quotations/queries';
import { useSalesOrder } from '../../api/sales-orders/queries';
import { useSalesInvoice, useSalesInvoiceRegister } from '../../api/sales-invoices/queries';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import {
  DocumentBody,
  DocumentChain,
  DocumentHeaderBar,
  InfoGrid,
  PanelCard,
  SectionCard,
  TotalsPanel,
  type ChainStep,
} from '../../../../components/document/document-layout';
import { DocumentHistory } from '../../../../components/document/document-history';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { FEATURE_KEYS } from '../../../../lib/feature-keys';
import { formatDate } from '../../../../lib/format-date';
import { LineTaxesNote } from '../../../../components/taxes/line-taxes-note';
import { taxTotalsRowsFromDto } from '../../../../components/taxes/tax-totals';
import { SALES_INVOICE_STATUS_VARIANT, SALES_INVOICES_PATH, salesInvoiceStatusLabelKey } from './sales-invoice-status';
import { useSalesInvoiceActions } from './use-sales-invoice-actions';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { PrintButton } from '../../../../components/printing/print-button';
import { useSalesRepName } from '../sales-reps/sales-rep-select';
import { useTenantSettings } from '../../../settings/queries';
import { formatMoney } from '../../../../lib/money';
import { WhatsAppShareButton } from '../../../../components/document/whatsapp-share';
import { SalesInvoiceInstallmentsSection } from './sales-invoice-installments-section';

const PAYMENTS_PATH = '/sales/payments-received';

export function SalesInvoiceDetailsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: invoice, isLoading, isError } = useSalesInvoice(id);
  const { data: order } = useSalesOrder(invoice?.salesOrderId);
  const { data: customer } = useCustomer(order?.customerId);
  const variantIndex = useVariantIndex();
  const actions = useSalesInvoiceActions();
  // Credit limit (migration 0109): checked before posting a draft.
  const { data: creditCheck } = useCustomerCreditCheck(
    invoice?.status === 'draft' ? order?.customerId : null,
    invoice?.totalAmount.amountMinorUnits,
    invoice?.totalAmount.currency,
  );
  const creditBlocked = isCreditBlocked(creditCheck);
  const salesOrdersEnabled = useHasFeature(FEATURE_KEYS.SALES_SALES_ORDERS);
  const deliveriesEnabled = useHasFeature(FEATURE_KEYS.SALES_DELIVERIES);
  const quotationsEnabled = useHasFeature(FEATURE_KEYS.SALES_QUOTATIONS);
  const { data: quotation } = useQuotation(quotationsEnabled ? order?.sourceQuotationId : null);
  const { data: deliveries } = useDeliveriesBySalesOrder(deliveriesEnabled ? order?.id : null);
  const { data: registerRows } = useSalesInvoiceRegister(
    { customerId: order?.customerId },
    Boolean(order?.customerId),
  );
  const { data: payments } = usePaymentReceivedRegister({ salesInvoiceId: id }, Boolean(id));
  const money = registerRows?.find((row) => row.id === id);
  const salesRepName = useSalesRepName(invoice?.salesRepId);
  const { data: settings } = useTenantSettings();

  const quantityTotal = useMemo(
    () => (invoice?.lines ?? []).reduce((sum, line) => sum + line.quantityInvoiced, 0),
    [invoice],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={SALES_INVOICES_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const currency = invoice.totalAmount.currency;
  const isDraft = invoice.status === 'draft';
  const isPosted = invoice.status === 'posted';
  const outstanding = money ? BigInt(money.outstandingMinorUnits) : null;
  const canCollect = isPosted && (outstanding === null || outstanding > 0n);
  const livePayments = (payments ?? []).filter((payment) => payment.status !== 'cancelled');
  const collectHref = `${PAYMENTS_PATH}/new?customerId=${order?.customerId ?? ''}&invoiceId=${invoice.id}`;

  // Where this invoice sits in the sales flow, from the real related documents.
  // Steps the tenant turned off are hidden (their documents are auto-created behind the scenes).
  const steps: ChainStep[] = [];
  if (quotationsEnabled && order?.sourceQuotationId) {
    steps.push({
      key: 'quotation',
      label: t('documents.steps.quotation'),
      detail: quotation?.quotationNumber,
      state: 'done',
      to: `/sales/quotations/${order.sourceQuotationId}`,
    });
  }
  if (salesOrdersEnabled && order) {
    steps.push({
      key: 'order',
      label: t('documents.steps.salesOrder'),
      detail: order.soNumber,
      state: 'done',
      to: `/sales/sales-orders/${order.id}`,
    });
  }
  if (deliveriesEnabled) {
    const liveDeliveries = (deliveries ?? []).filter((delivery) => delivery.status !== 'cancelled');
    if (liveDeliveries.length === 0) {
      steps.push({ key: 'delivery', label: t('documents.steps.delivery'), state: 'upcoming' });
    }
    for (const delivery of liveDeliveries) {
      steps.push({
        key: `delivery-${delivery.id}`,
        label: t('documents.steps.delivery'),
        detail: delivery.deliveryNumber,
        state: delivery.status === 'confirmed' ? 'done' : 'current',
        to: `/sales/deliveries/${delivery.id}`,
      });
    }
  }
  steps.push({
    key: 'invoice',
    label: t('documents.steps.invoice'),
    detail: invoice.invoiceNumber,
    state: isPosted ? 'done' : 'current',
  });
  for (const payment of livePayments) {
    steps.push({
      key: `payment-${payment.id}`,
      label: t('documents.steps.payment'),
      detail: payment.paymentNumber,
      state: payment.status === 'posted' ? 'done' : 'current',
      to: `${PAYMENTS_PATH}/${payment.id}`,
    });
  }
  if (livePayments.length === 0 || (outstanding !== null && outstanding > 0n)) {
    steps.push({
      key: 'payment-next',
      label: t('documents.steps.payment'),
      state: canCollect ? 'current' : 'upcoming',
      to: canCollect ? collectHref : undefined,
    });
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={SALES_INVOICES_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('sales.tabs.salesInvoices')}
        title={<span className="tabular">{invoice.invoiceNumber}</span>}
        status={
          <>
            <Badge variant={SALES_INVOICE_STATUS_VARIANT[invoice.status]} dot>
              {t(salesInvoiceStatusLabelKey(invoice.status))}
            </Badge>
            {money && money.overdueDays > 0 ? (
              <Badge variant="danger">{t('sales.salesInvoices.overdueDays', { days: money.overdueDays })}</Badge>
            ) : null}
          </>
        }
        actions={
          <>
            <PrintButton documentType="sales_invoice" id={invoice.id} receipt />
            {invoice.status !== 'cancelled' ? (
              <Can permission="sales.manage">
                <WhatsAppShareButton
                  kind="sales-invoices"
                  documentId={invoice.id}
                  phone={customer?.phone}
                  buildMessage={(url) =>
                    t('sales.whatsapp.invoiceMessage', {
                      customer: customer?.name ?? '',
                      company: settings?.companyName ?? '',
                      number: invoice.invoiceNumber,
                      total: formatMoney(invoice.totalAmount.amountMinorUnits, currency),
                      outstanding: formatMoney(
                        isPosted && money ? money.outstandingMinorUnits : invoice.totalAmount.amountMinorUnits,
                        currency,
                      ),
                      dueDate: formatDate(money?.dueDate ?? invoice.dueDate),
                      url,
                    })
                  }
                />
              </Can>
            ) : null}
            <Can permission="sales.manage">
              {isDraft || invoice.status === 'cancelled' ? (
                <Button
                  variant="ghost"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  disabled={actions.isPending}
                  onClick={async () => {
                    if (await actions.remove(invoice.id)) navigate(SALES_INVOICES_PATH);
                  }}
                >
                  {t('common.delete')}
                </Button>
              ) : null}
              {isDraft ? (
                <>
                  <Button variant="outline" disabled={actions.isPending} onClick={() => void actions.cancel(invoice.id)}>
                    {t('sales.salesInvoices.cancel')}
                  </Button>
                  <Button
                    disabled={actions.isPending || creditBlocked}
                    title={creditBlocked ? t('sales.creditLimit.blockedHint') : undefined}
                    onClick={async () => {
                      // Above the limit the credit prompt replaces the usual "post?" prompt.
                      if (creditCheck?.exceeded) {
                        if (await confirmCreditLimit(creditCheck, t)) void actions.post(invoice.id, { confirm: false });
                        return;
                      }
                      void actions.post(invoice.id);
                    }}
                  >
                    <CheckCircle2 />
                    {t('sales.salesInvoices.post')}
                  </Button>
                </>
              ) : null}
              {canCollect ? (
                <Button asChild>
                  <Link to={collectHref}>
                    <Wallet />
                    {t('sales.salesInvoices.recordPayment')}
                  </Link>
                </Button>
              ) : null}
            </Can>
          </>
        }
      />

      <DocumentChain steps={steps} label={t('documents.chain')} />

      <DocumentBody
        main={
          <>
            {isDraft ? <CreditLimitCallout check={creditCheck} /> : null}
            {invoice.status !== 'cancelled' ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-info/20 bg-info-soft px-4 py-3 text-[13px] text-info">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{isPosted ? t('sales.salesInvoices.postedNote') : t('sales.salesInvoices.draftNote')}</span>
              </div>
            ) : null}

            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  { label: t('sales.salesInvoices.customer'), value: customer?.name },
                  ...(salesOrdersEnabled
                    ? [
                        {
                          label: t('sales.salesInvoices.salesOrder'),
                          value: order ? (
                            <Link to={`/sales/sales-orders/${order.id}`} className="tabular text-primary hover:underline">
                              {order.soNumber}
                            </Link>
                          ) : (
                            '—'
                          ),
                        },
                      ]
                    : []),
                  {
                    label: t('sales.salesInvoices.invoiceDate'),
                    value: <span className="tabular">{formatDate(invoice.invoiceDate)}</span>,
                  },
                  {
                    label: t('sales.salesInvoices.dueDate'),
                    value: <span className="tabular">{formatDate(money?.dueDate ?? invoice.dueDate)}</span>,
                  },
                  ...(invoice.externalReference
                    ? [
                        {
                          label: t('sales.salesInvoices.externalReference'),
                          value: <span dir="ltr" className="font-mono">{invoice.externalReference}</span>,
                        },
                      ]
                    : []),
                  ...(salesRepName ? [{ label: t('salesReps.field'), value: salesRepName }] : []),
                  ...(invoice.notes ? [{ label: t('documents.notes'), value: invoice.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>

            <SectionCard
              title={t('documents.lines')}
              description={`${t('documents.linesCount')}: ${invoice.lines.length}`}
              flush
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>{t('sales.salesInvoices.lineProduct')}</TableHead>
                    <TableHead className="text-end">{t('documents.quantity')}</TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('documents.unitPrice')}</TableHead>
                    <TableHead className={AMOUNT_CELL}>{t('documents.lineTotal')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.lines.map((line, index) => {
                    const variant = variantIndex.get(line.productVariantId);
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex flex-col leading-snug">
                            <span className="font-medium">{variant?.productName ?? '—'}</span>
                            <span className="text-xs text-muted-foreground">
                              {variant?.sku}
                              {line.notes ? ` · ${line.notes}` : ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-end">
                          <QuantityWithUnit
                            quantity={line.quantityInvoiced}
                            productVariantId={line.productVariantId}
                            unitOfMeasureId={line.unitOfMeasureId}
                          />
                        </TableCell>
                        <TableCell className={AMOUNT_CELL}>
                          <Amount value={line.unitPrice.amountMinorUnits} hideCurrency />
                        </TableCell>
                        <TableCell className={`${AMOUNT_CELL} font-semibold`}>
                          <Amount value={line.netAmount.amountMinorUnits} hideCurrency />
                          <LineTaxesNote taxes={line.taxes} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {invoice.lines.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        {t('documents.emptyLines')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </SectionCard>

            <SalesInvoiceInstallmentsSection
              invoiceId={invoice.id}
              invoiceDate={invoice.invoiceDate}
              cancelled={invoice.status === 'cancelled'}
            />

            {livePayments.length > 0 ? (
              <SectionCard title={t('sales.salesInvoices.payments')} flush>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t('sales.paymentsReceived.paymentNumber')}</TableHead>
                      <TableHead>{t('sales.paymentsReceived.paymentDate')}</TableHead>
                      <TableHead>{t('sales.paymentsReceived.paymentMethod')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead className={AMOUNT_CELL}>{t('sales.paymentsReceived.allocationAmount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {livePayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <Link to={`${PAYMENTS_PATH}/${payment.id}`} className="font-medium tabular-nums text-primary hover:underline">
                            {payment.paymentNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="tabular-nums">{formatDate(payment.paymentDate ?? payment.createdAt)}</TableCell>
                        <TableCell>{t(`sales.paymentsReceived.paymentMethodValue.${payment.paymentMethod}`)}</TableCell>
                        <TableCell>
                          <Badge variant={payment.status === 'posted' ? 'info' : 'neutral'} dot>
                            {t(`sales.paymentsReceived.status.${payment.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className={AMOUNT_CELL}>
                          <Amount value={payment.allocatedToInvoiceMinorUnits} currency={payment.currency} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </SectionCard>
            ) : null}

            <PanelCard>
              <AttachmentsPanel entityType="sales_invoice" entityId={invoice.id} />
            </PanelCard>
          </>
        }
        side={
          <>
            <TotalsPanel
              title={t('documents.summary')}
              rows={[
                { label: t('documents.linesCount'), value: invoice.lines.length },
                { label: t('documents.quantityTotal'), value: quantityTotal },
                ...taxTotalsRowsFromDto(t, invoice),
              ]}
              totalLabel={t('documents.total')}
              totalValue={<Amount value={invoice.totalAmount.amountMinorUnits} hideCurrency />}
              currency={currency}
            />
            {isPosted && money ? (
              <TotalsPanel
                title={t('sales.salesInvoices.collection')}
                rows={[
                  { label: t('sales.salesInvoices.paid'), value: <Amount value={money.paidMinorUnits} hideCurrency zeroAsDash /> },
                  {
                    label: t('sales.salesInvoices.credited'),
                    value: <Amount value={money.creditedMinorUnits} hideCurrency zeroAsDash />,
                  },
                ]}
                totalLabel={t('sales.salesInvoices.outstanding')}
                totalValue={<Amount value={money.outstandingMinorUnits} hideCurrency />}
                currency={money.currency || currency}
              />
            ) : null}
            {customer ? (
              <SectionCard title={t('documents.partyDetails')}>
                <InfoGrid
                  items={[
                    { label: t('sales.salesInvoices.customer'), value: customer.name, wide: true },
                    { label: t('documents.code'), value: <span className="tabular">{customer.code}</span>, wide: true },
                    ...(customer.phone
                      ? [{ label: t('documents.phone'), value: <span dir="ltr">{customer.phone}</span>, wide: true }]
                      : []),
                    ...(customer.taxNumber
                      ? [{ label: t('documents.taxNumber'), value: <span className="tabular">{customer.taxNumber}</span>, wide: true }]
                      : []),
                  ]}
                />
              </SectionCard>
            ) : null}
            <DocumentHistory entityType="sales_invoice" entityId={invoice.id} />
          </>
        }
      />
    </div>
  );
}
