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
import { useCustomer } from '../../api/customers/queries';
import { useSalesOrder } from '../../api/sales-orders/queries';
import { useSalesInvoice } from '../../api/sales-invoices/queries';
import { useVariantIndex } from '../../hooks/sales-invoices/use-variant-index';
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
import { FEATURE_KEYS } from '../../../../lib/feature-keys';
import { formatAmount } from '../../../../lib/money';
import { LineTaxesNote } from '../../../../components/taxes/line-taxes-note';
import { taxTotalsRowsFromDto } from '../../../../components/taxes/tax-totals';
import { SALES_INVOICE_STATUS_VARIANT, salesInvoiceStatusLabelKey } from './sales-invoice-status';
import { SALES_INVOICES_PATH } from './sales-invoices-tab';
import { useSalesInvoiceActions } from './use-sales-invoice-actions';
import { QuantityWithUnit } from '../../../../components/product/unit-select';

export function SalesInvoiceDetailsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: invoice, isLoading, isError } = useSalesInvoice(id);
  const { data: order } = useSalesOrder(invoice?.salesOrderId);
  const { data: customer } = useCustomer(order?.customerId);
  const variantIndex = useVariantIndex();
  const actions = useSalesInvoiceActions();
  const salesOrdersEnabled = useHasFeature(FEATURE_KEYS.SALES_SALES_ORDERS);
  const deliveriesEnabled = useHasFeature(FEATURE_KEYS.SALES_DELIVERIES);
  const quotationsEnabled = useHasFeature(FEATURE_KEYS.SALES_QUOTATIONS);

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

  // Where this invoice sits in the sales flow. Steps the tenant turned off are hidden
  // (their documents are auto-created behind the scenes, never shown to the user).
  const steps: ChainStep[] = [];
  if (quotationsEnabled && order?.sourceQuotationId) {
    steps.push({
      key: 'quotation',
      label: t('documents.steps.quotation'),
      state: 'done',
      to: '/sales/quotations',
    });
  }
  if (salesOrdersEnabled) {
    steps.push({
      key: 'order',
      label: t('documents.steps.salesOrder'),
      detail: order?.soNumber,
      state: 'done',
      to: '/sales/sales-orders',
    });
  }
  if (deliveriesEnabled) {
    steps.push({
      key: 'delivery',
      label: t('documents.steps.delivery'),
      state: 'done',
      to: '/sales/deliveries',
    });
  }
  steps.push({
    key: 'invoice',
    label: t('documents.steps.invoice'),
    detail: invoice.invoiceNumber,
    state: isPosted ? 'done' : 'current',
  });
  steps.push({
    key: 'payment',
    label: t('documents.steps.payment'),
    state: isPosted ? 'current' : 'upcoming',
  });

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={SALES_INVOICES_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('sales.tabs.salesInvoices')}
        title={<span className="tabular">{invoice.invoiceNumber}</span>}
        status={
          <Badge variant={SALES_INVOICE_STATUS_VARIANT[invoice.status]} dot>
            {t(salesInvoiceStatusLabelKey(invoice.status))}
          </Badge>
        }
        actions={
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
                <Button
                  variant="outline"
                  disabled={actions.isPending}
                  onClick={() => void actions.cancel(invoice.id)}
                >
                  {t('sales.salesInvoices.cancel')}
                </Button>
                <Button disabled={actions.isPending} onClick={() => void actions.post(invoice.id)}>
                  <CheckCircle2 />
                  {t('sales.salesInvoices.post')}
                </Button>
              </>
            ) : null}
            {isPosted ? (
              <Button variant="outline" asChild>
                <Link to="/sales/payments-received">
                  <Wallet />
                  {t('sales.salesInvoices.recordPayment')}
                </Link>
              </Button>
            ) : null}
          </Can>
        }
      />

      <DocumentChain steps={steps} label={t('documents.chain')} />

      <DocumentBody
        main={
          <>
            {invoice.status !== 'cancelled' ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-info/20 bg-info-soft px-4 py-3 text-[13px] text-info">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {isPosted ? t('sales.salesInvoices.postedNote') : t('sales.salesInvoices.draftNote')}
                </span>
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
                          value: <span className="tabular">{order?.soNumber ?? '—'}</span>,
                        },
                      ]
                    : []),
                  {
                    label: t('sales.salesInvoices.invoiceDate'),
                    value: <span className="tabular">{invoice.invoiceDate ?? '—'}</span>,
                  },
                  {
                    label: t('sales.salesInvoices.dueDate'),
                    value: <span className="tabular">{invoice.dueDate ?? '—'}</span>,
                  },
                  ...(invoice.notes
                    ? [{ label: t('documents.notes'), value: invoice.notes, wide: true }]
                    : []),
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
                    <TableHead className="text-end">{t('documents.unitPrice')}</TableHead>
                    <TableHead className="text-end">{t('documents.lineTotal')}</TableHead>
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
                        <TableCell className="text-end"><QuantityWithUnit quantity={line.quantityInvoiced} productVariantId={line.productVariantId} unitOfMeasureId={line.unitOfMeasureId} /></TableCell>
                        <TableCell className="text-end">
                          {formatAmount(line.unitPrice.amountMinorUnits)}
                        </TableCell>
                        <TableCell className="text-end font-semibold">
                          {formatAmount(line.netAmount.amountMinorUnits)}
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
              totalValue={formatAmount(invoice.totalAmount.amountMinorUnits)}
              currency={currency}
            />
            {customer ? (
              <SectionCard title={t('documents.partyDetails')}>
                <InfoGrid
                  items={[
                    { label: t('sales.salesInvoices.customer'), value: customer.name, wide: true },
                    {
                      label: t('documents.code'),
                      value: <span className="tabular">{customer.code}</span>,
                      wide: true,
                    },
                    ...(customer.phone
                      ? [
                          {
                            label: t('documents.phone'),
                            value: <span dir="ltr">{customer.phone}</span>,
                            wide: true,
                          },
                        ]
                      : []),
                    ...(customer.taxNumber
                      ? [
                          {
                            label: t('documents.taxNumber'),
                            value: <span className="tabular">{customer.taxNumber}</span>,
                            wide: true,
                          },
                        ]
                      : []),
                  ]}
                />
              </SectionCard>
            ) : null}
          </>
        }
      />
    </div>
  );
}
