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
import { CheckCircle2, FileQuestion, Info } from 'lucide-react';

import { AttachmentsPanel } from '../../../attachments/components/attachments-panel';
import { useSupplier } from '../../api/suppliers/queries';
import { usePurchaseOrder } from '../../api/purchase-orders/queries';
import { usePurchaseInvoice } from '../../api/purchase-invoices/queries';
import { useVariantIndex } from '../../hooks/purchase-invoices/use-variant-index';
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
import { formatAmount, multiplyMinorUnits } from '../../../../lib/money';
import { PURCHASE_INVOICE_STATUS_VARIANT, purchaseInvoiceStatusLabelKey } from './purchase-invoice-status';
import { PURCHASE_INVOICES_PATH } from './purchase-invoices-tab';
import { usePurchaseInvoiceActions } from './use-purchase-invoice-actions';
import { QuantityWithUnit } from '../../../../components/product/unit-select';

export function PurchaseInvoiceDetailsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: invoice, isLoading, isError } = usePurchaseInvoice(id);
  const { data: order } = usePurchaseOrder(invoice?.purchaseOrderId);
  const { data: supplier } = useSupplier(order?.supplierId);
  const variantIndex = useVariantIndex();
  const actions = usePurchaseInvoiceActions();
  const purchaseOrdersEnabled = useHasFeature(FEATURE_KEYS.PURCHASES_PURCHASE_ORDERS);
  const goodsReceiptsEnabled = useHasFeature(FEATURE_KEYS.PURCHASES_GOODS_RECEIPTS);
  const quotationsEnabled = useHasFeature(FEATURE_KEYS.PURCHASES_SUPPLIER_QUOTATIONS);

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
            <Link to={PURCHASE_INVOICES_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const currency = invoice.totalAmount.currency;
  const isDraft = invoice.status === 'draft';
  const isPosted = invoice.status === 'posted';

  // Where this invoice sits in the purchasing flow. Steps the tenant turned off are hidden
  // (their documents are auto-created behind the scenes, never shown to the user).
  const steps: ChainStep[] = [];
  if (quotationsEnabled && order?.sourceQuotationId) {
    steps.push({
      key: 'quotation',
      label: t('documents.steps.quotation'),
      state: 'done',
      to: '/purchases/rfqs',
    });
  }
  if (purchaseOrdersEnabled) {
    steps.push({
      key: 'order',
      label: t('documents.steps.purchaseOrder'),
      detail: order?.poNumber,
      state: 'done',
      to: '/purchases/purchase-orders',
    });
  }
  if (goodsReceiptsEnabled) {
    steps.push({
      key: 'receipt',
      label: t('documents.steps.goodsReceipt'),
      state: 'done',
      to: '/purchases/goods-receipts',
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
    label: t('documents.steps.supplierPayment'),
    state: isPosted ? 'current' : 'upcoming',
  });

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={PURCHASE_INVOICES_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('purchases.tabs.purchaseInvoices')}
        title={<span className="tabular">{invoice.invoiceNumber}</span>}
        status={
          <Badge variant={PURCHASE_INVOICE_STATUS_VARIANT[invoice.status]} dot>
            {t(purchaseInvoiceStatusLabelKey(invoice.status))}
          </Badge>
        }
        actions={
          <Can permission="purchases.manage">
            {isDraft || invoice.status === 'cancelled' ? (
              <Button
                variant="ghost"
                className="text-danger hover:bg-danger-soft hover:text-danger"
                disabled={actions.isPending}
                onClick={async () => {
                  if (await actions.remove(invoice.id)) navigate(PURCHASE_INVOICES_PATH);
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
                  {t('purchases.purchaseInvoices.cancel')}
                </Button>
                <Button disabled={actions.isPending} onClick={() => void actions.post(invoice.id)}>
                  <CheckCircle2 />
                  {t('purchases.purchaseInvoices.post')}
                </Button>
              </>
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
                  {isPosted
                    ? t('purchases.purchaseInvoices.postedNote')
                    : t('purchases.purchaseInvoices.draftNote')}
                </span>
              </div>
            ) : null}

            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  { label: t('purchases.purchaseInvoices.supplier'), value: supplier?.name },
                  ...(purchaseOrdersEnabled
                    ? [
                        {
                          label: t('purchases.purchaseInvoices.purchaseOrder'),
                          value: <span className="tabular">{order?.poNumber ?? '—'}</span>,
                        },
                      ]
                    : []),
                  ...(invoice.supplierInvoiceNumber
                    ? [
                        {
                          label: t('purchases.purchaseInvoices.supplierInvoiceNumber'),
                          value: <span className="tabular">{invoice.supplierInvoiceNumber}</span>,
                        },
                      ]
                    : []),
                  {
                    label: t('purchases.purchaseInvoices.invoiceDate'),
                    value: <span className="tabular">{invoice.invoiceDate ?? '—'}</span>,
                  },
                  {
                    label: t('purchases.purchaseInvoices.dueDate'),
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
                    <TableHead>{t('purchases.purchaseInvoices.lineProduct')}</TableHead>
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
                          {formatAmount(
                            multiplyMinorUnits(line.unitPrice.amountMinorUnits, line.quantityInvoiced),
                          )}
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
              <AttachmentsPanel entityType="purchase_invoice" entityId={invoice.id} />
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
              ]}
              totalLabel={t('documents.total')}
              totalValue={formatAmount(invoice.totalAmount.amountMinorUnits)}
              currency={currency}
            />
            {supplier ? (
              <SectionCard title={t('documents.partyDetails')}>
                <InfoGrid
                  items={[
                    { label: t('purchases.purchaseInvoices.supplier'), value: supplier.name, wide: true },
                    {
                      label: t('documents.code'),
                      value: <span className="tabular">{supplier.code}</span>,
                      wide: true,
                    },
                    ...(supplier.phone
                      ? [
                          {
                            label: t('documents.phone'),
                            value: <span dir="ltr">{supplier.phone}</span>,
                            wide: true,
                          },
                        ]
                      : []),
                    ...(supplier.taxNumber
                      ? [
                          {
                            label: t('documents.taxNumber'),
                            value: <span className="tabular">{supplier.taxNumber}</span>,
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
