import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createSalesInvoiceSchema,
  type CreateSalesInvoiceDto,
  type CreateSalesInvoiceLineDto,
} from '@erp-platform/contracts';
import {
  Badge,
  Button,
  buildCustomFieldsSchema,
  CustomFieldsFormSection,
  EmptyState,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  toast,
  useHasFeature,
} from '@erp-platform/ui';
import { CheckCircle2, FileWarning, Info } from 'lucide-react';

import { useCustomFieldDefinitions } from '../../../settings/queries';
import { useProductsWithVariants } from '../../../inventory/api/products/queries';
import { useWarehouses } from '../../../inventory/api/warehouses/queries';
import { useCustomers } from '../../api/customers/queries';
import { useSalesOrders } from '../../api/sales-orders/queries';
import { useCreateSalesInvoice } from '../../api/sales-invoices/queries';
import {
  useSalesOrderInvoiceable,
  type InvoiceableSoLine,
} from '../../hooks/sales-invoices/use-sales-order-invoiceable';
import { ApiError } from '../../../../lib/api-client';
import { FEATURE_KEYS } from '../../../../lib/feature-keys';
import { decimalToMinorUnits, formatAmount, sumMinorUnits } from '../../../../lib/money';
import {
  DocumentBody,
  DocumentHeaderBar,
  SectionCard,
  TotalsPanel,
} from '../../../../components/document/document-layout';
import {
  DirectLinesEditor,
  newDirectLine,
  parseDirectLines,
  previewDirectLineAmount,
  type DirectLineDraft,
} from '../../../../components/document/direct-lines-editor';
import {
  createEmptySalesInvoiceDrafts,
  previewSoLineAmount,
  SalesInvoiceLineItemsEditor,
  type SalesInvoiceLineDrafts,
} from './sales-invoice-line-items-editor';
import { SALES_INVOICES_PATH } from './sales-invoices-tab';
import { useSalesInvoiceActions } from './use-sales-invoice-actions';

const SALES_INVOICE_ENTITY_TYPE = 'sales_invoice';

/** Only rows with a positive quantityInvoiced are included (a partial invoice against a
 * sales order is normal); an invalid quantity (non-numeric, <= 0, or exceeding what's
 * remaining) on any touched row fails the whole submission rather than silently
 * dropping it. An empty unitPrice draft is omitted so the server falls back to the
 * sales order line's own price. */
function prepareOrderLines(
  invoiceableLines: InvoiceableSoLine[],
  drafts: SalesInvoiceLineDrafts,
): CreateSalesInvoiceLineDto[] | null {
  const prepared: CreateSalesInvoiceLineDto[] = [];
  for (const line of invoiceableLines) {
    const draft = drafts[line.salesOrderLineId];
    if (!draft || draft.quantityInvoiced.trim() === '') continue;
    const quantityInvoiced = Number(draft.quantityInvoiced);
    if (!Number.isFinite(quantityInvoiced) || quantityInvoiced <= 0 || quantityInvoiced > line.remaining) {
      return null;
    }
    let unitPrice: CreateSalesInvoiceLineDto['unitPrice'];
    if (draft.unitPrice.trim() !== '') {
      try {
        unitPrice = {
          amountMinorUnits: decimalToMinorUnits(draft.unitPrice),
          currency: line.unitPrice.currency,
        };
      } catch {
        return null;
      }
    }
    prepared.push({
      salesOrderLineId: line.salesOrderLineId,
      quantityInvoiced,
      unitPrice,
      notes: draft.notes.trim() === '' ? undefined : draft.notes,
    });
  }
  return prepared.length > 0 ? prepared : null;
}

function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type HeaderFormValues = Omit<CreateSalesInvoiceDto, 'lines' | 'directLines'>;

/**
 * New sales invoice — a full page (claude/ui-redesign-plan.md, Phase 3).
 *
 * Two creation paths, matching SalesInvoicesService.create():
 *  - Sales Orders enabled → invoice against a confirmed order (worksheet of its lines).
 *  - Sales Orders disabled → "direct" invoice: customer + free product lines; the
 *    backend creates the hidden order itself. The backend rejects the direct path when
 *    Sales Orders is on, so only one mode is ever offered.
 * When Deliveries is disabled the backend also needs a warehouse to move stock from.
 */
export function SalesInvoiceCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createInvoice = useCreateSalesInvoice();
  const actions = useSalesInvoiceActions();
  const salesOrdersEnabled = useHasFeature(FEATURE_KEYS.SALES_SALES_ORDERS);
  const deliveriesEnabled = useHasFeature(FEATURE_KEYS.SALES_DELIVERIES);
  const directMode = !salesOrdersEnabled;
  const needsWarehouse = !deliveriesEnabled;

  const { data: salesOrders, isLoading: ordersLoading } = useSalesOrders();
  const { data: customers, isLoading: customersLoading } = useCustomers();
  const { data: warehouses } = useWarehouses();
  const { data: productsWithVariants } = useProductsWithVariants();
  const { data: definitions, isLoading: definitionsLoading } =
    useCustomFieldDefinitions(SALES_INVOICE_ENTITY_TYPE);

  const [drafts, setDrafts] = useState<SalesInvoiceLineDrafts>({});
  const [directLines, setDirectLines] = useState<DirectLineDraft[]>(() => [newDirectLine()]);
  const [linesError, setLinesError] = useState<string | null>(null);
  // A ref, not state: the clicked button sets it right before the form's submit
  // handler runs, and that handler must see the new value in the same tick.
  const submitIntent = useRef<'draft' | 'post'>('draft');

  // Only a confirmed sales order (any status past 'draft'/'cancelled') can be invoiced
  // — matches SalesInvoicesService.create()'s own check.
  const invoiceableOrders = useMemo(
    () => (salesOrders ?? []).filter((so) => so.status !== 'draft' && so.status !== 'cancelled'),
    [salesOrders],
  );
  const customerById = useMemo(() => new Map((customers ?? []).map((c) => [c.id, c])), [customers]);
  const variants = useMemo(
    () =>
      productsWithVariants.flatMap((product) =>
        product.variants.filter((v) => v.isActive).map((v) => ({ id: v.id, name: product.name, sku: v.sku })),
      ),
    [productsWithVariants],
  );

  const formSchema = useMemo(() => {
    const staticSchema = createSalesInvoiceSchema.omit({
      lines: true,
      directLines: true,
      customFields: true,
    });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      salesOrderId: '',
      customerId: '',
      warehouseId: '',
      invoiceDate: todayIso(),
      dueDate: '',
      notes: '',
      customFields: {},
    },
  });

  // Sensible defaults once the lists load.
  useEffect(() => {
    if (!directMode && !form.getValues('salesOrderId') && invoiceableOrders[0]) {
      form.setValue('salesOrderId', invoiceableOrders[0].id);
    }
  }, [directMode, invoiceableOrders, form]);
  useEffect(() => {
    if (needsWarehouse && !form.getValues('warehouseId') && warehouses?.[0]) {
      form.setValue('warehouseId', warehouses[0].id);
    }
  }, [needsWarehouse, warehouses, form]);

  const selectedSalesOrderId = form.watch('salesOrderId');
  const selectedCustomerId = form.watch('customerId');
  const invoiceDate = form.watch('invoiceDate');
  const { lines: invoiceableLines, isLoading: invoiceableLoading } = useSalesOrderInvoiceable(
    directMode ? null : selectedSalesOrderId,
  );

  const selectedOrder = invoiceableOrders.find((so) => so.id === selectedSalesOrderId);
  const customer = customerById.get((directMode ? selectedCustomerId : selectedOrder?.customerId) ?? '');
  const currency = directMode
    ? (customer?.defaultCurrency ?? '')
    : (selectedOrder?.currency ?? invoiceableLines[0]?.unitPrice.currency ?? '');

  // The invoicing worksheet's rows depend entirely on which sales order is selected —
  // reset the drafts whenever that changes, same as the delivering/returnable worksheets.
  useEffect(() => {
    setDrafts(createEmptySalesInvoiceDrafts(invoiceableLines));
  }, [selectedSalesOrderId, invoiceableLines.length]);

  // Due date follows the customer's payment terms unless the user already set one.
  useEffect(() => {
    if (customer?.paymentTermsDays != null && invoiceDate && !form.getFieldState('dueDate').isDirty) {
      form.setValue('dueDate', addDays(invoiceDate, customer.paymentTermsDays));
    }
  }, [customer, invoiceDate, form]);

  const previewAmounts = directMode
    ? directLines.map(previewDirectLineAmount)
    : invoiceableLines.map((line) => previewSoLineAmount(line, drafts[line.salesOrderLineId]));
  const filledAmounts = previewAmounts.filter((a): a is string => a !== null);
  const estimatedTotal = sumMinorUnits(filledAmounts);

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const common = {
      invoiceDate: headerValues.invoiceDate || undefined,
      dueDate: headerValues.dueDate || undefined,
      notes: headerValues.notes || undefined,
      customFields: headerValues.customFields,
      warehouseId: needsWarehouse ? headerValues.warehouseId || undefined : undefined,
    };

    let payload: CreateSalesInvoiceDto;
    if (directMode) {
      if (!headerValues.customerId) {
        form.setError('customerId', { message: t('sales.salesInvoices.customer') });
        return;
      }
      const parsed = parseDirectLines(directLines, currency);
      if (!parsed) {
        setLinesError(t('sales.salesInvoices.linesError'));
        return;
      }
      payload = {
        ...common,
        customerId: headerValues.customerId,
        directLines: parsed,
      };
    } else {
      if (!headerValues.salesOrderId) {
        form.setError('salesOrderId', { message: t('sales.salesInvoices.salesOrder') });
        return;
      }
      const preparedLines = prepareOrderLines(invoiceableLines, drafts);
      if (!preparedLines) {
        setLinesError(t('sales.salesInvoices.linesError'));
        return;
      }
      payload = { ...common, salesOrderId: headerValues.salesOrderId, lines: preparedLines };
    }

    if (submitIntent.current === 'post' && !window.confirm(t('sales.salesInvoices.postConfirm'))) return;

    try {
      const created = await createInvoice.mutateAsync(payload);
      toast.success(t('sales.salesInvoices.createSuccess'));
      if (submitIntent.current === 'post') await actions.post(created.id, { confirm: false });
      navigate(`${SALES_INVOICES_PATH}/${created.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.salesInvoices.createError'));
    }
  }

  const loading = definitionsLoading || (directMode ? customersLoading : ordersLoading);
  const busy = createInvoice.isPending || actions.isPending;

  // Nothing can be invoiced yet (no confirmed orders / no customers).
  const blocked = directMode ? (customers ?? []).length === 0 : invoiceableOrders.length === 0;

  const header = (
    <DocumentHeaderBar
      backTo={SALES_INVOICES_PATH}
      backLabel={t('documents.back')}
      eyebrow={t('sales.tabs.salesInvoices')}
      title={t('sales.salesInvoices.newInvoice')}
      status={<Badge variant="neutral">{t('sales.salesInvoices.status.draft')}</Badge>}
      actions={
        <>
          <Button variant="ghost" asChild>
            <Link to={SALES_INVOICES_PATH}>{t('common.cancel')}</Link>
          </Button>
          <Button
            type="submit"
            form="sales-invoice-form"
            variant="outline"
            disabled={busy || loading || blocked}
            onClick={() => {
              submitIntent.current = 'draft';
            }}
          >
            {t('documents.saveDraft')}
          </Button>
          <Button
            type="submit"
            form="sales-invoice-form"
            disabled={busy || loading || blocked}
            onClick={() => {
              submitIntent.current = 'post';
            }}
          >
            <CheckCircle2 />
            {t('documents.saveAndPost')}
          </Button>
        </>
      }
    />
  );

  if (loading) {
    return (
      <div className="flex flex-col">
        {header}
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (!directMode && invoiceableOrders.length === 0) {
    return (
      <div className="flex flex-col">
        {header}
        <EmptyState icon={<FileWarning />} title={t('sales.salesInvoices.noInvoiceableOrders')} />
      </div>
    );
  }
  if (directMode && (customers ?? []).length === 0) {
    return (
      <div className="flex flex-col">
        {header}
        <EmptyState
          icon={<FileWarning />}
          title={t('sales.salesInvoices.noCustomers')}
          action={
            <Button asChild>
              <Link to="/sales/customers">{t('sales.tabs.customers')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {header}
      <Form {...form}>
        <form id="sales-invoice-form" onSubmit={form.handleSubmit(onSubmit)}>
          <DocumentBody
            main={
              <>
                <div className="flex items-start gap-2.5 rounded-xl border border-info/20 bg-info-soft px-4 py-3 text-[13px] text-info">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {directMode
                      ? t('sales.salesInvoices.directHint')
                      : t('sales.salesInvoices.fromOrderHint')}
                  </span>
                </div>

                <SectionCard title={t('documents.info')}>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {directMode ? (
                      <FormField
                        control={form.control}
                        name="customerId"
                        render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel>{t('sales.salesInvoices.customer')}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t('documents.selectPlaceholder')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {(customers ?? []).map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name} — {c.code}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <FormField
                        control={form.control}
                        name="salesOrderId"
                        render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel>{t('sales.salesInvoices.salesOrder')}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t('documents.selectPlaceholder')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {invoiceableOrders.map((so) => (
                                  <SelectItem key={so.id} value={so.id}>
                                    {so.soNumber}
                                    {customerById.get(so.customerId)
                                      ? ` — ${customerById.get(so.customerId)!.name}`
                                      : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <FormField
                      control={form.control}
                      name="invoiceDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('sales.salesInvoices.invoiceDate')}</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={field.value ?? ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('sales.salesInvoices.dueDate')}</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={field.value ?? ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {needsWarehouse ? (
                      <FormField
                        control={form.control}
                        name="warehouseId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('documents.warehouse')}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t('documents.selectPlaceholder')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {(warehouses ?? []).map((w) => (
                                  <SelectItem key={w.id} value={w.id}>
                                    {w.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>{t('documents.warehouseHint')}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : null}
                  </div>
                </SectionCard>

                <SectionCard title={t('documents.lines')} flush>
                  {directMode ? (
                    <DirectLinesEditor lines={directLines} onChange={setDirectLines} variants={variants} />
                  ) : invoiceableLoading ? (
                    <div className="px-5 pb-5">
                      <Skeleton className="h-24 w-full" />
                    </div>
                  ) : (
                    <SalesInvoiceLineItemsEditor
                      invoiceableLines={invoiceableLines}
                      drafts={drafts}
                      onChange={setDrafts}
                    />
                  )}
                  {linesError ? <p className="px-5 pb-4 text-sm text-destructive">{linesError}</p> : null}
                </SectionCard>

                <SectionCard>
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('documents.notes')}</FormLabel>
                        <FormControl>
                          <Textarea rows={3} {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </SectionCard>

                {definitions && definitions.length > 0 ? (
                  <SectionCard title={t('sales.salesInvoices.customFields')}>
                    <CustomFieldsFormSection definitions={definitions} />
                  </SectionCard>
                ) : null}
              </>
            }
            side={
              <TotalsPanel
                title={t('documents.summary')}
                rows={[
                  ...(customer ? [{ label: t('sales.salesInvoices.customer'), value: customer.name }] : []),
                  { label: t('documents.linesCount'), value: filledAmounts.length },
                ]}
                totalLabel={t('documents.estimatedTotal')}
                totalValue={formatAmount(estimatedTotal)}
                currency={currency}
                footer={
                  <>
                    <Button
                      type="submit"
                      form="sales-invoice-form"
                      size="lg"
                      disabled={busy}
                      onClick={() => {
                        submitIntent.current = 'post';
                      }}
                    >
                      {t('documents.saveAndPost')}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">{t('documents.estimateNote')}</p>
                  </>
                }
              />
            }
          />
        </form>
      </Form>
    </div>
  );
}
