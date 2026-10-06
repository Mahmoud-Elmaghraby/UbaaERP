import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createPurchaseInvoiceSchema,
  type CreatePurchaseInvoiceDto,
  type CreatePurchaseInvoiceLineDto,
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
import { useWarehouses } from '../../../inventory/api/warehouses/queries';
import { useSuppliers } from '../../api/suppliers/queries';
import { usePurchaseOrders } from '../../api/purchase-orders/queries';
import { useCreatePurchaseInvoice } from '../../api/purchase-invoices/queries';
import {
  usePurchaseOrderInvoiceable,
  type InvoiceablePoLine,
} from '../../hooks/purchase-invoices/use-purchase-order-invoiceable';
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
  createEmptyPurchaseInvoiceDrafts,
  previewPoLineAmount,
  PurchaseInvoiceLineItemsEditor,
  type PurchaseInvoiceLineDrafts,
} from './purchase-invoice-line-items-editor';
import { PURCHASE_INVOICES_PATH } from './purchase-invoices-tab';
import { usePurchaseInvoiceActions } from './use-purchase-invoice-actions';

const PURCHASE_INVOICE_ENTITY_TYPE = 'purchase_invoice';

/** Only rows with a positive quantityInvoiced are included (a partial invoice against a
 * purchase order is normal); an invalid quantity (non-numeric, <= 0, or exceeding what's
 * remaining) on any touched row fails the whole submission rather than silently
 * dropping it. An empty unitPrice draft is omitted so the server falls back to the
 * purchase order line's own price. */
function prepareOrderLines(
  invoiceableLines: InvoiceablePoLine[],
  drafts: PurchaseInvoiceLineDrafts,
): CreatePurchaseInvoiceLineDto[] | null {
  const prepared: CreatePurchaseInvoiceLineDto[] = [];
  for (const line of invoiceableLines) {
    const draft = drafts[line.purchaseOrderLineId];
    if (!draft || draft.quantityInvoiced.trim() === '') continue;
    const quantityInvoiced = Number(draft.quantityInvoiced);
    if (!Number.isFinite(quantityInvoiced) || quantityInvoiced <= 0 || quantityInvoiced > line.remaining) {
      return null;
    }
    let unitPrice: CreatePurchaseInvoiceLineDto['unitPrice'];
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
      purchaseOrderLineId: line.purchaseOrderLineId,
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

type HeaderFormValues = Omit<CreatePurchaseInvoiceDto, 'lines' | 'directLines'>;

/**
 * New purchase invoice — a full page (claude/ui-redesign-plan.md, Phase 3).
 *
 * Two creation paths, matching PurchaseInvoicesService.create():
 *  - Purchase Orders enabled → invoice against a confirmed order (worksheet of its lines).
 *  - Purchase Orders disabled → "direct" invoice: supplier + free product lines; the
 *    backend creates the hidden order itself. The backend rejects the direct path when
 *    Purchase Orders is on, so only one mode is ever offered.
 * When Goods Receipts is disabled the backend also needs a warehouse to move stock from.
 */
export function PurchaseInvoiceCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createInvoice = useCreatePurchaseInvoice();
  const actions = usePurchaseInvoiceActions();
  const purchaseOrdersEnabled = useHasFeature(FEATURE_KEYS.PURCHASES_PURCHASE_ORDERS);
  const goodsReceiptsEnabled = useHasFeature(FEATURE_KEYS.PURCHASES_GOODS_RECEIPTS);
  const directMode = !purchaseOrdersEnabled;
  const needsWarehouse = !goodsReceiptsEnabled;

  const { data: purchaseOrders, isLoading: ordersLoading } = usePurchaseOrders();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers();
  const { data: warehouses } = useWarehouses();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    PURCHASE_INVOICE_ENTITY_TYPE,
  );

  const [drafts, setDrafts] = useState<PurchaseInvoiceLineDrafts>({});
  const [directLines, setDirectLines] = useState<DirectLineDraft[]>(() => [newDirectLine()]);
  const [linesError, setLinesError] = useState<string | null>(null);
  // A ref, not state: the clicked button sets it right before the form's submit
  // handler runs, and that handler must see the new value in the same tick.
  const submitIntent = useRef<'draft' | 'post'>('draft');

  // Only a confirmed purchase order (any status past 'draft'/'cancelled') can be invoiced
  // — matches PurchaseInvoicesService.create()'s own check.
  const invoiceableOrders = useMemo(
    () => (purchaseOrders ?? []).filter((po) => po.status !== 'draft' && po.status !== 'cancelled'),
    [purchaseOrders],
  );
  const supplierById = useMemo(() => new Map((suppliers ?? []).map((c) => [c.id, c])), [suppliers]);

  const formSchema = useMemo(() => {
    const staticSchema = createPurchaseInvoiceSchema.omit({
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
      purchaseOrderId: '',
      supplierId: '',
      warehouseId: '',
      supplierInvoiceNumber: '',
      invoiceDate: todayIso(),
      dueDate: '',
      notes: '',
      customFields: {},
    },
  });

  // Sensible defaults once the lists load.
  useEffect(() => {
    if (!directMode && !form.getValues('purchaseOrderId') && invoiceableOrders[0]) {
      form.setValue('purchaseOrderId', invoiceableOrders[0].id);
    }
  }, [directMode, invoiceableOrders, form]);
  useEffect(() => {
    if (needsWarehouse && !form.getValues('warehouseId') && warehouses?.[0]) {
      form.setValue('warehouseId', warehouses[0].id);
    }
  }, [needsWarehouse, warehouses, form]);

  const selectedPurchaseOrderId = form.watch('purchaseOrderId');
  const selectedSupplierId = form.watch('supplierId');
  const invoiceDate = form.watch('invoiceDate');
  const { lines: invoiceableLines, isLoading: invoiceableLoading } = usePurchaseOrderInvoiceable(
    directMode ? null : selectedPurchaseOrderId,
  );

  const selectedOrder = invoiceableOrders.find((po) => po.id === selectedPurchaseOrderId);
  const supplier = supplierById.get((directMode ? selectedSupplierId : selectedOrder?.supplierId) ?? '');
  const currency = directMode
    ? (supplier?.defaultCurrency ?? '')
    : (invoiceableLines[0]?.unitPrice.currency ?? '');

  // The invoicing worksheet's rows depend entirely on which purchase order is selected —
  // reset the drafts whenever that changes, same as the delivering/returnable worksheets.
  useEffect(() => {
    setDrafts(createEmptyPurchaseInvoiceDrafts(invoiceableLines));
  }, [selectedPurchaseOrderId, invoiceableLines.length]);

  // Due date follows the supplier's payment terms unless the user already set one.
  useEffect(() => {
    if (supplier?.paymentTermsDays != null && invoiceDate && !form.getFieldState('dueDate').isDirty) {
      form.setValue('dueDate', addDays(invoiceDate, supplier.paymentTermsDays));
    }
  }, [supplier, invoiceDate, form]);

  const previewAmounts = directMode
    ? directLines.map(previewDirectLineAmount)
    : invoiceableLines.map((line) => previewPoLineAmount(line, drafts[line.purchaseOrderLineId]));
  const filledAmounts = previewAmounts.filter((a): a is string => a !== null);
  const estimatedTotal = sumMinorUnits(filledAmounts);

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const common = {
      invoiceDate: headerValues.invoiceDate || undefined,
      dueDate: headerValues.dueDate || undefined,
      notes: headerValues.notes || undefined,
      supplierInvoiceNumber: headerValues.supplierInvoiceNumber || undefined,
      customFields: headerValues.customFields,
      warehouseId: needsWarehouse ? headerValues.warehouseId || undefined : undefined,
    };

    let payload: CreatePurchaseInvoiceDto;
    if (directMode) {
      if (!headerValues.supplierId) {
        form.setError('supplierId', { message: t('purchases.purchaseInvoices.supplier') });
        return;
      }
      const parsed = parseDirectLines(directLines, currency);
      if (!parsed) {
        setLinesError(t('purchases.purchaseInvoices.linesError'));
        return;
      }
      payload = {
        ...common,
        supplierId: headerValues.supplierId,
        directLines: parsed.map(({ quantity, ...rest }) => ({ ...rest, quantityInvoiced: quantity })),
      };
    } else {
      if (!headerValues.purchaseOrderId) {
        form.setError('purchaseOrderId', { message: t('purchases.purchaseInvoices.purchaseOrder') });
        return;
      }
      const preparedLines = prepareOrderLines(invoiceableLines, drafts);
      if (!preparedLines) {
        setLinesError(t('purchases.purchaseInvoices.linesError'));
        return;
      }
      payload = { ...common, purchaseOrderId: headerValues.purchaseOrderId, lines: preparedLines };
    }

    if (submitIntent.current === 'post' && !window.confirm(t('purchases.purchaseInvoices.postConfirm')))
      return;

    try {
      const created = await createInvoice.mutateAsync(payload);
      toast.success(t('purchases.purchaseInvoices.createSuccess'));
      if (submitIntent.current === 'post') await actions.post(created.id, { confirm: false });
      navigate(`${PURCHASE_INVOICES_PATH}/${created.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.purchaseInvoices.createError'));
    }
  }

  const loading = definitionsLoading || (directMode ? suppliersLoading : ordersLoading);
  const busy = createInvoice.isPending || actions.isPending;

  // Nothing can be invoiced yet (no confirmed orders / no suppliers).
  const blocked = directMode ? (suppliers ?? []).length === 0 : invoiceableOrders.length === 0;

  const header = (
    <DocumentHeaderBar
      backTo={PURCHASE_INVOICES_PATH}
      backLabel={t('documents.back')}
      eyebrow={t('purchases.tabs.purchaseInvoices')}
      title={t('purchases.purchaseInvoices.newInvoice')}
      status={<Badge variant="neutral">{t('purchases.purchaseInvoices.status.draft')}</Badge>}
      actions={
        <>
          <Button variant="ghost" asChild>
            <Link to={PURCHASE_INVOICES_PATH}>{t('common.cancel')}</Link>
          </Button>
          <Button
            type="submit"
            form="purchase-invoice-form"
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
            form="purchase-invoice-form"
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
        <EmptyState icon={<FileWarning />} title={t('purchases.purchaseInvoices.noInvoiceableOrders')} />
      </div>
    );
  }
  if (directMode && (suppliers ?? []).length === 0) {
    return (
      <div className="flex flex-col">
        {header}
        <EmptyState
          icon={<FileWarning />}
          title={t('purchases.purchaseInvoices.noSuppliers')}
          action={
            <Button asChild>
              <Link to="/purchases/suppliers">{t('purchases.tabs.suppliers')}</Link>
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
        <form id="purchase-invoice-form" onSubmit={form.handleSubmit(onSubmit)}>
          <DocumentBody
            main={
              <>
                <div className="flex items-start gap-2.5 rounded-xl border border-info/20 bg-info-soft px-4 py-3 text-[13px] text-info">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {directMode
                      ? t('purchases.purchaseInvoices.directHint')
                      : t('purchases.purchaseInvoices.fromOrderHint')}
                  </span>
                </div>

                <SectionCard title={t('documents.info')}>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {directMode ? (
                      <FormField
                        control={form.control}
                        name="supplierId"
                        render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel>{t('purchases.purchaseInvoices.supplier')}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t('documents.selectPlaceholder')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {(suppliers ?? []).map((c) => (
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
                        name="purchaseOrderId"
                        render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel>{t('purchases.purchaseInvoices.purchaseOrder')}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t('documents.selectPlaceholder')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {invoiceableOrders.map((po) => (
                                  <SelectItem key={po.id} value={po.id}>
                                    {po.poNumber}
                                    {supplierById.get(po.supplierId)
                                      ? ` — ${supplierById.get(po.supplierId)!.name}`
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
                      name="supplierInvoiceNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('purchases.purchaseInvoices.supplierInvoiceNumber')}</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value ?? ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="invoiceDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('purchases.purchaseInvoices.invoiceDate')}</FormLabel>
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
                          <FormLabel>{t('purchases.purchaseInvoices.dueDate')}</FormLabel>
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
                    <DirectLinesEditor lines={directLines} onChange={setDirectLines} />
                  ) : invoiceableLoading ? (
                    <div className="px-5 pb-5">
                      <Skeleton className="h-24 w-full" />
                    </div>
                  ) : (
                    <PurchaseInvoiceLineItemsEditor
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
                  <SectionCard title={t('purchases.purchaseInvoices.customFields')}>
                    <CustomFieldsFormSection definitions={definitions} />
                  </SectionCard>
                ) : null}
              </>
            }
            side={
              <TotalsPanel
                title={t('documents.summary')}
                rows={[
                  ...(supplier
                    ? [{ label: t('purchases.purchaseInvoices.supplier'), value: supplier.name }]
                    : []),
                  { label: t('documents.linesCount'), value: filledAmounts.length },
                ]}
                totalLabel={t('documents.estimatedTotal')}
                totalValue={formatAmount(estimatedTotal)}
                currency={currency}
                footer={
                  <>
                    <Button
                      type="submit"
                      form="purchase-invoice-form"
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
