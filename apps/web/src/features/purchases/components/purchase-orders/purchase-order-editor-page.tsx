import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createPurchaseOrderSchema, type PurchaseOrderWithLinesDto } from '@erp-platform/contracts';
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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
  useHasFeature,
} from '@erp-platform/ui';
import { FileQuestion } from 'lucide-react';

import { useBaseCurrency, useCustomFieldDefinitions } from '../../../settings/queries';
import { useSuppliers } from '../../api/suppliers/queries';
import { useSupplierQuotation } from '../../api/supplier-quotations/queries';
import { useCreatePurchaseOrder, usePurchaseOrder, useUpdatePurchaseOrder } from '../../api/purchase-orders/queries';
import { useEligibleQuotations } from '../../hooks/purchase-orders/use-eligible-quotations';
import { SupplierPicker } from '../../lib/supplier-picker';
import { LastPurchasePrice } from '../../lib/last-purchase-price';
import { draftsFromPrefill, fillMissingPrices, readPrefillLines } from '../../lib/prefill-lines';
import { useVariantLookupMap } from '../../../inventory/api/products/queries';
import { useDocumentPriceList } from '../../../sales/api/price-lists/use-document-price-list';
import { PriceListSelect } from '../../../sales/components/price-lists/price-list-select';
import { ApiError } from '../../../../lib/api-client';
import { FEATURE_KEYS } from '../../../../lib/feature-keys';
import { multiplyMinorUnits, minorUnitsToDecimalString } from '../../../../lib/money';
import { useSaveShortcut } from '../../../../lib/use-save-shortcut';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { DocumentBody, DocumentHeaderBar, SectionCard, TotalsPanel } from '../../../../components/document/document-layout';
import {
  DirectLinesEditor,
  newDirectLine,
  parseDirectLines,
  previewDirectLineAmount,
  type DirectLineDraft,
} from '../../../../components/document/direct-lines-editor';
import { PURCHASE_ORDERS_PATH, purchaseOrderStatusLabelKey } from './purchase-order-status';

const PURCHASE_ORDER_ENTITY_TYPE = 'purchase_order';

type Mode = 'manual' | 'fromQuotation';

type HeaderFormValues = {
  supplierId: string;
  sourceQuotationId: string;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
};

function linesFromOrder(order: PurchaseOrderWithLinesDto): DirectLineDraft[] {
  if (order.lines.length === 0) return [newDirectLine()];
  return order.lines.map((line) => ({
    ...newDirectLine(),
    productVariantId: line.productVariantId,
    unitOfMeasureId: line.unitOfMeasureId ?? null,
    quantity: String(line.quantity),
    unitPrice: minorUnitsToDecimalString(line.unitPrice.amountMinorUnits),
    notes: line.notes ?? '',
  }));
}

/**
 * /purchases/purchase-orders/new and /:id/edit (drafts only). A new order is either manual
 * (supplier + lines) or copied from a selected supplier quotation — the backend's two
 * mutually exclusive creation paths. Editing never changes the supplier or the source.
 */
export function PurchaseOrderEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, isError } = usePurchaseOrder(id);
  const { isLoading: definitionsLoading } = useCustomFieldDefinitions(PURCHASE_ORDER_ENTITY_TYPE);
  if ((id && isLoading) || definitionsLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (id && (isError || !order || order.status !== 'draft')) {
    return <EmptyState icon={<FileQuestion />} title={t('documents.notFound')} />;
  }
  return <PurchaseOrderEditor order={id ? order : undefined} />;
}

function PurchaseOrderEditor({ order }: { order: PurchaseOrderWithLinesDto | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const createOrder = useCreatePurchaseOrder();
  const updateOrder = useUpdatePurchaseOrder();
  const { data: suppliers } = useSuppliers();
  const { data: definitions } = useCustomFieldDefinitions(PURCHASE_ORDER_ENTITY_TYPE);
  const baseCurrency = useBaseCurrency();
  const quotationsEnabled = useHasFeature(FEATURE_KEYS.PURCHASES_SUPPLIER_QUOTATIONS);
  const { eligibleQuotations, isLoading: eligibleLoading } = useEligibleQuotations();
  const variantIndex = useVariantIndex();

  const initialQuotationId = params.get('quotationId') ?? '';
  const [mode, setMode] = useState<Mode>(!order && quotationsEnabled && initialQuotationId ? 'fromQuotation' : 'manual');
  const location = useLocation();
  // New order from the low-stock list: its items arrive as router state.
  const [lines, setLines] = useState<DirectLineDraft[]>(() => {
    if (order) return linesFromOrder(order);
    const prefill = readPrefillLines(location.state);
    return prefill.length > 0 ? draftsFromPrefill(prefill) : [newDirectLine()];
  });
  const [linesError, setLinesError] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = createPurchaseOrderSchema.pick({ expectedDeliveryDate: true, notes: true }).extend({
      supplierId: z.string(),
      sourceQuotationId: z.string(),
    });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      supplierId: order?.supplierId ?? params.get('supplierId') ?? '',
      sourceQuotationId: initialQuotationId,
      expectedDeliveryDate: order?.expectedDeliveryDate ?? '',
      notes: order?.notes ?? '',
      customFields: order?.customFields ?? {},
    },
  });

  const supplierId = form.watch('supplierId');
  const quotationId = form.watch('sourceQuotationId');
  const { data: quotation, isLoading: quotationLoading } = useSupplierQuotation(
    mode === 'fromQuotation' && quotationId ? quotationId : null,
  );
  const fromQuotation = mode === 'fromQuotation';
  const supplier = suppliers?.find((s) => s.id === (fromQuotation ? quotation?.supplierId : supplierId));
  const currency = order?.lines[0]?.unitPrice.currency || supplier?.defaultCurrency || baseCurrency;

  // Supplier price list (manual orders): follows the supplier's default, can be switched by hand.
  const variants = useVariantLookupMap();
  const { priceListId, setPriceListId, pricer } = useDocumentPriceList<DirectLineDraft>({
    partyPriceListId: supplier?.priceListId,
    partyId: fromQuotation ? null : supplierId,
    currency,
    variants,
    setLines,
    kind: 'purchase',
  });

  // Handed-over items have no price yet: give them the default (supplier list / purchase price).
  useEffect(() => {
    if (!order) setLines((current) => fillMissingPrices(current, variants, pricer));
  }, [order, variants, pricer]);

  const manualAmounts = lines.map(previewDirectLineAmount);
  const quotationAmounts = (quotation?.lines ?? []).map((l) => multiplyMinorUnits(l.unitPrice.amountMinorUnits, String(l.quantity)));
  const amounts = fromQuotation ? quotationAmounts : manualAmounts;
  const filledCount = amounts.filter((a) => a !== null).length;
  const total = amounts.reduce<bigint>((sum, a) => sum + (a ? BigInt(a) : 0n), 0n);
  const totalCurrency = fromQuotation ? (quotation?.lines[0]?.unitPrice.currency ?? currency) : currency;

  const saving = createOrder.isPending || updateOrder.isPending;

  async function onSubmit(values: HeaderFormValues) {
    setLinesError(null);
    const header = {
      expectedDeliveryDate: values.expectedDeliveryDate || null,
      notes: values.notes || null,
      customFields: values.customFields,
    };
    try {
      let saved: PurchaseOrderWithLinesDto;
      if (fromQuotation) {
        if (!values.sourceQuotationId) {
          form.setError('sourceQuotationId', { message: t('purchases.purchaseOrders.quotationRequired') });
          return;
        }
        saved = await createOrder.mutateAsync({ ...header, sourceQuotationId: values.sourceQuotationId });
      } else {
        if (!order && !values.supplierId) {
          form.setError('supplierId', { message: t('purchases.purchaseOrders.supplierRequired') });
          return;
        }
        const prepared = parseDirectLines(lines, currency);
        if (!prepared) {
          setLinesError(t('purchases.purchaseOrders.linesError'));
          return;
        }
        saved = order
          ? await updateOrder.mutateAsync({ id: order.id, input: { ...header, lines: prepared } })
          : await createOrder.mutateAsync({ ...header, supplierId: values.supplierId, lines: prepared });
      }
      toast.success(t(order ? 'purchases.purchaseOrders.updateSuccess' : 'purchases.purchaseOrders.createSuccess'));
      navigate(`${PURCHASE_ORDERS_PATH}/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : t(order ? 'purchases.purchaseOrders.updateError' : 'purchases.purchaseOrders.createError'),
      );
    }
  }

  useSaveShortcut(() => void form.handleSubmit(onSubmit)(), saving);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DocumentHeaderBar
          backTo={order ? `${PURCHASE_ORDERS_PATH}/${order.id}` : PURCHASE_ORDERS_PATH}
          backLabel={t('documents.back')}
          eyebrow={t('purchases.tabs.purchaseOrders')}
          title={order ? t('purchases.purchaseOrders.editTitle', { number: order.poNumber }) : t('purchases.purchaseOrders.newOrder')}
          status={<Badge variant="neutral">{t(purchaseOrderStatusLabelKey('draft'))}</Badge>}
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
              {!order && quotationsEnabled ? (
                <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
                  <TabsList>
                    <TabsTrigger value="manual">{t('purchases.purchaseOrders.manualTab')}</TabsTrigger>
                    <TabsTrigger value="fromQuotation">{t('purchases.purchaseOrders.fromQuotationTab')}</TabsTrigger>
                  </TabsList>
                </Tabs>
              ) : null}

              <SectionCard title={t('documents.info')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {fromQuotation ? (
                    <FormField
                      control={form.control}
                      name="sourceQuotationId"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>{t('purchases.purchaseOrders.sourceQuotation')}</FormLabel>
                          {eligibleLoading ? (
                            <Skeleton className="h-10 w-full" />
                          ) : eligibleQuotations.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('purchases.purchaseOrders.noEligibleQuotations')}</p>
                          ) : (
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t('documents.selectPlaceholder')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {eligibleQuotations.map(({ quotation: q, rfqNumber, supplierName }) => (
                                  <SelectItem key={q.id} value={q.id}>
                                    {rfqNumber} — {supplierName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <FormField
                      control={form.control}
                      name="supplierId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('purchases.purchaseOrders.supplier')}</FormLabel>
                          <FormControl>
                            <SupplierPicker value={field.value} onChange={(value) => field.onChange(value)} disabled={Boolean(order)} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {!fromQuotation ? (
                    <div className="grid content-start gap-2">
                      <Label>{t('priceLists.supplierField')}</Label>
                      <PriceListSelect kind="purchase" value={priceListId} onChange={setPriceListId} currency={currency} />
                    </div>
                  ) : null}
                  <FormField
                    control={form.control}
                    name="expectedDeliveryDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('purchases.purchaseOrders.expectedDeliveryDate')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </SectionCard>

              <SectionCard title={fromQuotation ? t('purchases.purchaseOrders.linesPreview') : t('documents.lines')} flush>
                {fromQuotation ? (
                  quotationLoading ? (
                    <Skeleton className="m-5 h-24" />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>{t('purchases.purchaseOrders.lineProduct')}</TableHead>
                          <TableHead className="text-end">{t('documents.quantity')}</TableHead>
                          <TableHead className="text-end">{t('documents.unitPrice')}</TableHead>
                          <TableHead className="text-end">{t('documents.lineTotal')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(quotation?.lines ?? []).map((line, index) => {
                          const variant = variantIndex.get(line.productVariantId);
                          return (
                            <TableRow key={line.id}>
                              <TableCell>
                                <span className="font-medium">{variant?.productName ?? '—'}</span>
                                <span className="ms-2 text-xs text-muted-foreground">{variant?.sku}</span>
                              </TableCell>
                              <TableCell className="text-end">
                                <QuantityWithUnit quantity={line.quantity} productVariantId={line.productVariantId} unitOfMeasureId={line.unitOfMeasureId} />
                              </TableCell>
                              <TableCell className={AMOUNT_CELL}>
                                <Amount value={line.unitPrice.amountMinorUnits} hideCurrency />
                              </TableCell>
                              <TableCell className={AMOUNT_CELL}>
                                <Amount value={quotationAmounts[index]} hideCurrency />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {!quotation ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                              {t('purchases.purchaseOrders.pickQuotationFirst')}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  )
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <DirectLinesEditor
                        lines={lines}
                        onChange={setLines}
                        priceKind="purchase"
                        currency={currency}
                        pricer={pricer}
                        priceHint={(line, setPrice) => (
                          <LastPurchasePrice
                            productVariantId={line.productVariantId}
                            unitOfMeasureId={line.unitOfMeasureId}
                            supplierId={supplierId || order?.supplierId}
                            currency={currency}
                            onUse={setPrice}
                          />
                        )}
                      />
                    </div>
                    {linesError ? <p className="px-5 pb-4 text-sm text-destructive">{linesError}</p> : null}
                  </>
                )}
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
                ...(supplier ? [{ label: t('purchases.purchaseOrders.supplier'), value: supplier.name }] : []),
                { label: t('documents.linesCount'), value: filledCount },
              ]}
              totalLabel={t('documents.estimatedTotal')}
              totalValue={<Amount value={total.toString()} hideCurrency />}
              currency={totalCurrency}
              footer={
                <Button type="submit" size="lg" disabled={saving}>
                  {t('common.save')}
                </Button>
              }
            />
          }
        />
      </form>
    </Form>
  );
}
