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
  toast,
} from '@erp-platform/ui';
import { CheckCircle2, FileQuestion, Undo2 } from 'lucide-react';

import { useWarehouses } from '../../../inventory/api/warehouses/queries';
import { useCustomer } from '../../api/customers/queries';
import { useSalesOrder } from '../../api/sales-orders/queries';
import { useSalesInvoicesBySalesOrder } from '../../api/sales-invoices/queries';
import {
  useCancelDelivery,
  useConfirmDelivery,
  useDeleteDelivery,
  useDelivery,
} from '../../api/deliveries/queries';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { ApiError } from '../../../../lib/api-client';
import { formatDate } from '../../../../lib/format-date';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import {
  DocumentBody,
  DocumentHeaderBar,
  InfoGrid,
  SectionCard,
  TotalsPanel,
} from '../../../../components/document/document-layout';
import { DocumentHistory } from '../../../../components/document/document-history';
import { LotsSummary } from '../../../../components/document/lot-entry';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { PrintButton } from '../../../../components/printing/print-button';
import { DELIVERIES_PATH, DELIVERY_STATUS_VARIANT, deliveryStatusLabelKey } from './delivery-status';
import { SALES, SALES_WRITE } from '../../../../lib/permissions';

/** /sales/deliveries/:id — the delivery note with its actions, lines and history. */
export function DeliveryDetailsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: delivery, isLoading, isError } = useDelivery(id);
  const { data: order } = useSalesOrder(delivery?.salesOrderId);
  const { data: customer } = useCustomer(order?.customerId);
  const { data: invoices } = useSalesInvoicesBySalesOrder(delivery?.salesOrderId);
  const { data: warehouses } = useWarehouses();
  const variantIndex = useVariantIndex();
  const confirmDelivery = useConfirmDelivery();
  const cancelDelivery = useCancelDelivery();
  const deleteDelivery = useDeleteDelivery();
  const pending = confirmDelivery.isPending || cancelDelivery.isPending || deleteDelivery.isPending;

  const quantityTotal = useMemo(
    () => (delivery?.lines ?? []).reduce((sum, line) => sum + line.quantityDelivered, 0),
    [delivery],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !delivery) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={DELIVERIES_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const deliveryId = delivery.id;
  const isDraft = delivery.status === 'draft';
  const warehouseName = warehouses?.find((w) => w.id === delivery.warehouseId)?.name;
  const linkedInvoices = (invoices ?? []).filter((invoice) => invoice.status !== 'cancelled');

  async function run(action: { mutateAsync: (id: string) => Promise<unknown> }, successKey: string, errorKey: string) {
    try {
      await action.mutateAsync(deliveryId);
      toast.success(t(successKey));
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(errorKey));
      return false;
    }
  }

  async function handleConfirm() {
    if (!(await confirmDialog(t('sales.deliveries.confirmConfirm')))) return;
    await run(confirmDelivery, 'sales.deliveries.confirmSuccess', 'sales.deliveries.confirmError');
  }

  async function handleCancel() {
    if (!(await confirmDialog(t('sales.deliveries.cancelConfirm'), { tone: 'danger' }))) return;
    await run(cancelDelivery, 'sales.deliveries.cancelSuccess', 'sales.deliveries.cancelError');
  }

  async function handleDelete() {
    if (!(await confirmDialog(t('sales.deliveries.deleteConfirm'), { tone: 'danger' }))) return;
    if (await run(deleteDelivery, 'sales.deliveries.deleteSuccess', 'common.error')) navigate(DELIVERIES_PATH);
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={DELIVERIES_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('sales.tabs.deliveries')}
        title={<span className="tabular">{delivery.deliveryNumber}</span>}
        status={
          <Badge variant={DELIVERY_STATUS_VARIANT[delivery.status]} dot>
            {t(deliveryStatusLabelKey(delivery.status))}
          </Badge>
        }
        actions={
          <>
            <PrintButton documentType="delivery" id={delivery.id} />
            <Can permission={SALES_WRITE}>
              {isDraft || delivery.status === 'cancelled' ? (
                <Can permission={SALES.cancel}>
                  <Button
                    variant="ghost"
                    className="text-danger hover:bg-danger-soft hover:text-danger"
                    disabled={pending}
                    onClick={() => void handleDelete()}
                  >
                    {t('common.delete')}
                  </Button>
                </Can>
              ) : null}
              {isDraft ? (
                <>
                  <Can permission={SALES.cancel}>
                    <Button variant="outline" disabled={pending} onClick={() => void handleCancel()}>
                      {t('sales.deliveries.cancel')}
                    </Button>
                  </Can>
                  <Can permission={SALES.post}>
                    <Button disabled={pending} onClick={() => void handleConfirm()}>
                      <CheckCircle2 />
                      {t('sales.deliveries.confirm')}
                    </Button>
                  </Can>
                </>
              ) : null}
              {delivery.status === 'confirmed' ? (
                <Can permission={SALES.create}>
                  <Button variant="outline" asChild>
                    <Link to={`/sales/sales-returns/new?deliveryId=${delivery.id}`}>
                      <Undo2 />
                      {t('sales.deliveries.createReturn')}
                    </Link>
                  </Button>
                </Can>
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
                  {
                    label: t('sales.deliveries.customer'),
                    value: customer ? (
                      <Link className="text-primary hover:underline" to={`/sales/customers/${customer.id}/statement`}>
                        {customer.name}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  {
                    label: t('sales.deliveries.salesOrder'),
                    value: order ? (
                      <Link className="tabular text-primary hover:underline" to={`/sales/sales-orders/${order.id}`}>
                        {order.soNumber}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  {
                    label: t('sales.deliveries.deliveryDate'),
                    value: <span className="tabular">{formatDate(delivery.deliveryDate)}</span>,
                  },
                  { label: t('sales.deliveries.warehouse'), value: warehouseName ?? '—' },
                  ...(linkedInvoices.length > 0
                    ? [
                        {
                          label: t('sales.deliveries.invoices'),
                          value: (
                            <span className="flex flex-wrap gap-x-3">
                              {linkedInvoices.map((invoice) => (
                                <Link
                                  key={invoice.id}
                                  className="tabular text-primary hover:underline"
                                  to={`/sales/sales-invoices/${invoice.id}`}
                                >
                                  {invoice.invoiceNumber}
                                </Link>
                              ))}
                            </span>
                          ),
                        },
                      ]
                    : []),
                  ...(delivery.notes ? [{ label: t('documents.notes'), value: delivery.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>

            <SectionCard
              title={t('documents.lines')}
              description={`${t('documents.linesCount')}: ${delivery.lines.length}`}
              flush
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>{t('sales.deliveries.lineProduct')}</TableHead>
                    <TableHead className="text-end">{t('sales.deliveries.lineQuantityDelivered')}</TableHead>
                    <TableHead>{t('sales.deliveries.lineNotes')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {delivery.lines.map((line, index) => {
                    const variant = variantIndex.get(line.productVariantId);
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex flex-col leading-snug">
                            <span className="font-medium">{variant?.productName ?? '—'}</span>
                            <span className="text-xs text-muted-foreground">{variant?.sku}</span>
                            <LotsSummary lots={line.lots ?? []} />
                          </div>
                        </TableCell>
                        <TableCell className="text-end">
                          <QuantityWithUnit
                            quantity={line.quantityDelivered}
                            productVariantId={line.productVariantId}
                            unitOfMeasureId={line.unitOfMeasureId}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{line.notes ?? '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                  {delivery.lines.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        {t('documents.emptyLines')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </SectionCard>
          </>
        }
        side={
          <>
            <TotalsPanel
              title={t('documents.summary')}
              rows={[{ label: t('documents.linesCount'), value: delivery.lines.length }]}
              totalLabel={t('documents.quantityTotal')}
              totalValue={quantityTotal}
            />
            <DocumentHistory entityType="delivery" entityId={delivery.id} />
          </>
        }
      />
    </div>
  );
}
