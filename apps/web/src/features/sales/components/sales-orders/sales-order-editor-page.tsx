import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createSalesOrderSchema, type CreateSalesOrderLineDto, type SalesOrderWithLinesDto } from '@erp-platform/contracts';
import {
  Badge,
  buildCustomFieldsSchema,
  Button,
  CustomFieldsFormSection,
  EmptyState,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Label,
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';
import { FileQuestion } from 'lucide-react';

import { useBaseCurrency, useCustomFieldDefinitions } from '../../../settings/queries';
import { useCustomers } from '../../api/customers/queries';
import { useDocumentPriceList } from '../../api/price-lists/use-document-price-list';
import { useVariantLookupMap } from '../../../inventory/api/products/queries';
import { useCreateSalesOrder, useSalesOrder, useUpdateSalesOrder } from '../../api/sales-orders/queries';
import { CustomerPicker } from '../../lib/customer-picker';
import {
  createEmptyDiscountDraft,
  DiscountFields,
  discountDraftFromDto,
  resolveDiscountInput,
  type DiscountDraft,
} from '../../lib/discount-fields';
import { PriceListSelect } from '../price-lists/price-list-select';
import { SalesRepSelect } from '../sales-reps/sales-rep-select';
import { ApiError } from '../../../../lib/api-client';
import { minorUnitsToDecimalString } from '../../../../lib/money';
import { Amount } from '../../../../components/amount';
import { DocumentBody, DocumentHeaderBar, SectionCard, TotalsPanel } from '../../../../components/document/document-layout';
import {
  DirectLinesEditor,
  lineDiscountText,
  newDirectLine,
  parseDirectLines,
  parseLineDiscount,
  previewDirectLineAmount,
  type DirectLineDraft,
} from '../../../../components/document/direct-lines-editor';
import { SALES_ORDERS_PATH, salesOrderStatusLabelKey } from './sales-order-status';
import { WhenFeature } from '../../../../components/feature/when-feature';
import { useNewDocumentDefaults } from '../../../../components/document/use-new-document-defaults';

const SALES_ORDER_ENTITY_TYPE = 'sales_order';

type HeaderFormValues = {
  customerId: string;
  notes?: string | null;
  customFields?: Record<string, unknown>;
};

function linesFromOrder(order: SalesOrderWithLinesDto): DirectLineDraft[] {
  if (order.lines.length === 0) return [newDirectLine()];
  return order.lines.map((line) => ({
    ...newDirectLine(),
    productVariantId: line.productVariantId,
    unitOfMeasureId: line.unitOfMeasureId ?? null,
    quantity: String(line.quantity),
    unitPrice: minorUnitsToDecimalString(line.unitPrice.amountMinorUnits),
    notes: line.notes ?? '',
    discount: lineDiscountText(line),
  }));
}

/** Lines with their per-line discounts, or null when any row/discount is invalid. */
function prepareLines(lines: DirectLineDraft[], currency: string): CreateSalesOrderLineDto[] | null {
  const parsed = parseDirectLines(lines, currency);
  if (!parsed) return null;
  const result: CreateSalesOrderLineDto[] = [];
  for (const [index, line] of parsed.entries()) {
    const discount = parseLineDiscount(lines[index]!.discount, currency);
    if (!discount) return null;
    result.push({ ...line, ...discount });
  }
  return result;
}

/** Preview of the header discount applied to the lines' subtotal (minor units). */
function applyHeaderDiscount(subtotal: bigint, draft: DiscountDraft, currency: string): bigint {
  const resolved = resolveDiscountInput(draft, currency);
  if (resolved === 'invalid' || resolved.discountType === null) return subtotal;
  const off =
    resolved.discountType === 'percentage'
      ? (subtotal * BigInt(Math.round((resolved.discountPercentage ?? 0) * 100))) / 10000n
      : BigInt(resolved.discountFixedAmount?.amountMinorUnits ?? '0');
  return subtotal - off < 0n ? 0n : subtotal - off;
}

/** /sales/sales-orders/new and /:id/edit (drafts only) — a manual sales order as a full page.
 * Orders from a quotation are created from the quotation's own page. */
export function SalesOrderEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, isError } = useSalesOrder(id);
  const { isLoading: definitionsLoading } = useCustomFieldDefinitions(SALES_ORDER_ENTITY_TYPE);
  if ((id && isLoading) || definitionsLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (id && (isError || !order || order.status !== 'draft')) {
    return <EmptyState icon={<FileQuestion />} title={t('documents.notFound')} />;
  }
  return <SalesOrderEditor order={id ? order : undefined} />;
}

function SalesOrderEditor({ order }: { order: SalesOrderWithLinesDto | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createOrder = useCreateSalesOrder();
  const updateOrder = useUpdateSalesOrder();
  const { data: customers } = useCustomers();
  const { data: definitions } = useCustomFieldDefinitions(SALES_ORDER_ENTITY_TYPE);
  const baseCurrency = useBaseCurrency();
  const [lines, setLines] = useState<DirectLineDraft[]>(() => (order ? linesFromOrder(order) : [newDirectLine()]));
  const [linesError, setLinesError] = useState<string | null>(null);
  const [discountDraft, setDiscountDraft] = useState<DiscountDraft>(() =>
    order ? discountDraftFromDto(order) : createEmptyDiscountDraft(),
  );
  const [discountError, setDiscountError] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = createSalesOrderSchema
      .pick({ notes: true })
      .extend({ customerId: z.string().uuid({ message: t('sales.salesOrders.customerRequired') }) });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions, t]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      customerId: order?.customerId ?? new URLSearchParams(window.location.search).get('customerId') ?? '',
      notes: order?.notes ?? '',
      customFields: order?.customFields ?? {},
    },
  });

  useNewDocumentDefaults(form, { isNew: !order, notesSetting: 'sales.defaultInvoiceNotes', customers });

  const customerId = form.watch('customerId');
  const customer = customers?.find((c) => c.id === customerId);
  const currency =
    order?.currency || order?.lines[0]?.unitPrice.currency || customer?.defaultCurrency || baseCurrency;
  const variants = useVariantLookupMap();
  const { priceListId, setPriceListId, pricer } = useDocumentPriceList<DirectLineDraft>({
    partyPriceListId: customer?.priceListId,
    partyId: customerId,
    currency,
    variants,
    setLines,
  });

  // Sales rep: a new order follows the customer's default until picked by hand.
  const [salesRepId, setSalesRepId] = useState<string | null>(order?.salesRepId ?? null);
  const [repTouched, setRepTouched] = useState(false);
  const customerDefaultRep = customer?.salesRepId ?? null;
  useEffect(() => {
    if (!order && !repTouched) setSalesRepId(customerDefaultRep);
  }, [order, repTouched, customerDefaultRep]);

  const amounts = lines.map(previewDirectLineAmount);
  const filledCount = amounts.filter((a) => a !== null).length;
  const subtotal = amounts.reduce<bigint>((sum, a) => sum + (a ? BigInt(a) : 0n), 0n);
  const total = applyHeaderDiscount(subtotal, discountDraft, currency);

  const saving = createOrder.isPending || updateOrder.isPending;

  async function onSubmit(values: HeaderFormValues) {
    setLinesError(null);
    setDiscountError(null);
    const prepared = prepareLines(lines, currency);
    if (!prepared) {
      setLinesError(t('sales.salesOrders.linesError'));
      return;
    }
    const headerDiscount = resolveDiscountInput(discountDraft, currency);
    if (headerDiscount === 'invalid') {
      setDiscountError(t('sales.salesOrders.discountError'));
      return;
    }
    // Untouched on a new order: let the server apply the customer's default rep.
    const rep = order || repTouched ? { salesRepId } : {};
    const header = { notes: values.notes || null, customFields: values.customFields, ...headerDiscount, ...rep };
    try {
      const saved = order
        ? await updateOrder.mutateAsync({ id: order.id, input: { ...header, lines: prepared } })
        : await createOrder.mutateAsync({ ...header, customerId: values.customerId, lines: prepared });
      toast.success(t(order ? 'sales.salesOrders.updateSuccess' : 'sales.salesOrders.createSuccess'));
      navigate(`${SALES_ORDERS_PATH}/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t(order ? 'sales.salesOrders.updateError' : 'sales.salesOrders.createError'),
      );
    }
  }

  // Ctrl/⌘+S saves.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!saving) void form.handleSubmit(onSubmit)();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DocumentHeaderBar
          backTo={order ? `${SALES_ORDERS_PATH}/${order.id}` : SALES_ORDERS_PATH}
          backLabel={t('documents.back')}
          eyebrow={t('sales.tabs.salesOrders')}
          title={order ? t('sales.salesOrders.editTitle', { number: order.soNumber }) : t('sales.salesOrders.newOrder')}
          status={<Badge variant="neutral">{t(salesOrderStatusLabelKey('draft'))}</Badge>}
          actions={
            <>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={saving} title="Ctrl+S">
                {t('common.save')}
              </Button>
            </>
          }
        />
        <DocumentBody
          main={
            <>
              <SectionCard title={t('documents.info')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('sales.salesOrders.customer')}</FormLabel>
                        <FormControl>
                          <CustomerPicker
                            value={field.value}
                            onChange={(id) => field.onChange(id)}
                            disabled={Boolean(order)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid content-start gap-2">
                    <Label>{t('priceLists.field')}</Label>
                    <PriceListSelect value={priceListId} onChange={setPriceListId} currency={currency} />
                  </div>
                  <WhenFeature feature="sales.reps">
                    <div className="grid content-start gap-2">
                      <Label>{t('salesReps.field')}</Label>
                      <SalesRepSelect
                        value={salesRepId}
                        onChange={(id) => {
                          setRepTouched(true);
                          setSalesRepId(id);
                        }}
                      />
                    </div>
                  </WhenFeature>
                </div>
              </SectionCard>

              <SectionCard title={t('documents.lines')} flush>
                <div className="overflow-x-auto">
                  <DirectLinesEditor
                    lines={lines}
                    onChange={setLines}
                    priceKind="sale"
                    currency={currency}
                    pricer={pricer}
                    discounts
                  />
                </div>
                {linesError ? <p className="px-5 pb-4 text-sm text-destructive">{linesError}</p> : null}
              </SectionCard>

              <SectionCard title={t('sales.salesOrders.discountSectionTitle')}>
                <DiscountFields value={discountDraft} onChange={setDiscountDraft} currency={currency} />
                {discountError ? <p className="mt-2 text-sm text-destructive">{discountError}</p> : null}
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
                {definitions && definitions.length > 0 ? (
                  <div className="mt-4">
                    <CustomFieldsFormSection definitions={definitions} namePrefix="customFields" />
                  </div>
                ) : null}
              </SectionCard>
            </>
          }
          side={
            <TotalsPanel
              title={t('documents.summary')}
              rows={[
                ...(customer ? [{ label: t('sales.salesOrders.customer'), value: customer.name }] : []),
                { label: t('documents.linesCount'), value: filledCount },
                { label: t('sales.salesOrders.subtotalAmount'), value: <Amount value={subtotal.toString()} hideCurrency /> },
                ...(total !== subtotal
                  ? [
                      {
                        label: t('sales.salesOrders.discountSectionTitle'),
                        value: <Amount value={(total - subtotal).toString()} hideCurrency />,
                        tone: 'danger' as const,
                      },
                    ]
                  : []),
              ]}
              totalLabel={t('documents.estimatedTotal')}
              totalValue={<Amount value={total.toString()} hideCurrency />}
              currency={currency}
              footer={
                <>
                  <Button type="submit" size="lg" disabled={saving}>
                    {t('common.save')}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">{t('documents.estimateNote')}</p>
                </>
              }
            />
          }
        />
      </form>
    </Form>
  );
}
