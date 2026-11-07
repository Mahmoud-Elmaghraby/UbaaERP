import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createGoodsReceiptSchema, type CreateGoodsReceiptDto, type CreateGoodsReceiptLineDto } from '@erp-platform/contracts';
import {
  Badge,
  buildCustomFieldsSchema,
  Button,
  CustomFieldsFormSection,
  Form,
  FormControl,
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
} from '@erp-platform/ui';
import { ListChecks } from 'lucide-react';

import { useCustomFieldDefinitions, useTenantSettings } from '../../../settings/queries';
import { useWarehouses } from '../../../inventory/api/warehouses/queries';
import { useSuppliers } from '../../api/suppliers/queries';
import { usePurchaseOrders } from '../../api/purchase-orders/queries';
import { useCreateGoodsReceipt } from '../../api/goods-receipts/queries';
import { usePurchaseOrderRemaining, type RemainingPoLine } from '../../hooks/goods-receipts/use-purchase-order-remaining';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits } from '../../../../lib/money';
import { toWesternDigits } from '../../../../lib/search-normalize';
import { useSaveShortcut } from '../../../../lib/use-save-shortcut';
import { receiptLotsToDto, withImplicitSingleLotQuantity, type TrackingType } from '../../../../components/document/lot-entry';
import { DocumentPicker, type PickableDocument } from '../../../../components/document/document-picker';
import { DocumentBody, DocumentHeaderBar, SectionCard, TotalsPanel } from '../../../../components/document/document-layout';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import {
  createEmptyGoodsReceiptDrafts,
  GoodsReceiptLineItemsEditor,
  type GoodsReceiptLineDrafts,
} from './goods-receipt-line-items-editor';
import { GOODS_RECEIPTS_PATH, goodsReceiptStatusLabelKey } from './goods-receipt-status';

const GOODS_RECEIPT_ENTITY_TYPE = 'goods_receipt';

type HeaderFormValues = Omit<CreateGoodsReceiptDto, 'lines'>;

/** Rows with a quantity typed become lines (a partial receipt is normal). A bad quantity, a cost
 * below zero or bad lots on a touched row fails the whole save; an empty cost means "the order's
 * price" (applied by the server). Returns an i18n key on failure. */
function prepareLines(
  remainingLines: RemainingPoLine[],
  drafts: GoodsReceiptLineDrafts,
  trackingOf: (productVariantId: string) => TrackingType,
): CreateGoodsReceiptLineDto[] | string {
  const prepared: CreateGoodsReceiptLineDto[] = [];
  for (const line of remainingLines) {
    const draft = drafts[line.purchaseOrderLineId];
    if (!draft || draft.quantityReceived.trim() === '') continue;
    const quantityReceived = Number(toWesternDigits(draft.quantityReceived));
    if (!Number.isFinite(quantityReceived) || quantityReceived <= 0 || quantityReceived > line.remaining) {
      return 'purchases.goodsReceipts.linesError';
    }
    let unitCost: CreateGoodsReceiptLineDto['unitCost'];
    if (draft.unitCost.trim() !== '') {
      try {
        const amountMinorUnits = decimalToMinorUnits(draft.unitCost);
        if (BigInt(amountMinorUnits) < 0n) return 'purchases.goodsReceipts.costError';
        unitCost = { amountMinorUnits, currency: line.unitPrice.currency };
      } catch {
        return 'purchases.goodsReceipts.costError';
      }
    }
    const trackingType = trackingOf(line.productVariantId);
    let lots: CreateGoodsReceiptLineDto['lots'];
    if (trackingType !== 'none') {
      const result = receiptLotsToDto(trackingType, withImplicitSingleLotQuantity(draft.lots, quantityReceived), quantityReceived);
      if ('error' in result) return `lots.errors.${result.error}`;
      lots = result.lots;
    }
    prepared.push({
      purchaseOrderLineId: line.purchaseOrderLineId,
      quantityReceived,
      unitCost,
      notes: draft.notes.trim() === '' ? undefined : draft.notes,
      lots,
    });
  }
  return prepared.length > 0 ? prepared : 'purchases.goodsReceipts.linesError';
}

/** /purchases/goods-receipts/new[?purchaseOrderId=] — receive goods against a confirmed order. */
export function GoodsReceiptCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const createReceipt = useCreateGoodsReceipt();
  const { data: purchaseOrders, isLoading: ordersLoading } = usePurchaseOrders();
  const { data: suppliers } = useSuppliers();
  const { data: warehouses } = useWarehouses();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(GOODS_RECEIPT_ENTITY_TYPE);
  const { data: tenantSettings } = useTenantSettings();
  const variantIndex = useVariantIndex();
  const [drafts, setDrafts] = useState<GoodsReceiptLineDrafts>({});
  const [linesError, setLinesError] = useState<string | null>(null);

  // Only a confirmed or partially received order can be received (GoodsReceiptsService.create()).
  const receivableOrders = useMemo(
    () => (purchaseOrders ?? []).filter((po) => po.status === 'confirmed' || po.status === 'partially_received'),
    [purchaseOrders],
  );
  const orderDocuments = useMemo<PickableDocument[]>(() => {
    const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
    return receivableOrders.map((po) => ({
      id: po.id,
      number: po.poNumber,
      date: po.expectedDeliveryDate ?? String(po.createdAt),
      party: supplierName.get(po.supplierId) ?? null,
    }));
  }, [receivableOrders, suppliers]);

  const formSchema = useMemo(() => {
    const staticSchema = createGoodsReceiptSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      purchaseOrderId: params.get('purchaseOrderId') ?? '',
      warehouseId: '',
      receivedDate: new Date().toISOString().slice(0, 10),
      notes: '',
      customFields: {},
    },
  });

  useEffect(() => {
    if (!form.getValues('warehouseId') && warehouses?.[0]) form.setValue('warehouseId', warehouses[0].id);
  }, [warehouses, form]);

  const purchaseOrderId = form.watch('purchaseOrderId');
  const { lines: remainingLines, isLoading: remainingLoading } = usePurchaseOrderRemaining(purchaseOrderId || null);
  const tenantCurrency = tenantSettings?.currencyCode ?? 'EGP';
  const orderCurrency = remainingLines[0]?.unitPrice.currency;
  const foreignCurrency = orderCurrency && orderCurrency !== tenantCurrency ? orderCurrency : null;
  const order = receivableOrders.find((po) => po.id === purchaseOrderId);
  const supplier = suppliers?.find((s) => s.id === order?.supplierId);

  // The worksheet rows come from the chosen order — start fresh whenever it changes.
  useEffect(() => {
    setDrafts(createEmptyGoodsReceiptDrafts(remainingLines));
  }, [purchaseOrderId, remainingLines.length]);

  function receiveAll() {
    const next: GoodsReceiptLineDrafts = { ...drafts };
    for (const line of remainingLines) {
      const draft = next[line.purchaseOrderLineId];
      if (draft && line.remaining > 0) next[line.purchaseOrderLineId] = { ...draft, quantityReceived: String(line.remaining) };
    }
    setDrafts(next);
  }

  const touched = remainingLines.filter((l) => (drafts[l.purchaseOrderLineId]?.quantityReceived ?? '').trim() !== '');
  const quantityTotal = touched.reduce((sum, l) => sum + (Number(toWesternDigits(drafts[l.purchaseOrderLineId]!.quantityReceived)) || 0), 0);

  async function onSubmit(values: HeaderFormValues) {
    setLinesError(null);
    if (!values.purchaseOrderId) {
      form.setError('purchaseOrderId', { message: t('purchases.goodsReceipts.orderRequired') });
      return;
    }
    const prepared = prepareLines(remainingLines, drafts, (id) => variantIndex.get(id)?.trackingType ?? 'none');
    if (typeof prepared === 'string') {
      setLinesError(t(prepared));
      return;
    }
    try {
      const saved = await createReceipt.mutateAsync({
        ...values,
        receivedDate: values.receivedDate || undefined,
        exchangeRate: foreignCurrency ? values.exchangeRate || undefined : undefined,
        lines: prepared,
      });
      toast.success(t('purchases.goodsReceipts.createSuccess'));
      navigate(`${GOODS_RECEIPTS_PATH}/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.goodsReceipts.createError'));
    }
  }

  useSaveShortcut(() => void form.handleSubmit(onSubmit)(), createReceipt.isPending);

  if (definitionsLoading || ordersLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DocumentHeaderBar
          backTo={GOODS_RECEIPTS_PATH}
          backLabel={t('documents.back')}
          eyebrow={t('purchases.tabs.goodsReceipts')}
          title={t('purchases.goodsReceipts.newReceipt')}
          status={<Badge variant="neutral">{t(goodsReceiptStatusLabelKey('draft'))}</Badge>}
          actions={
            <>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createReceipt.isPending} title="Ctrl+S">
                {t('documents.saveDraft')}
              </Button>
            </>
          }
        />
        <DocumentBody
          main={
            <>
              <SectionCard title={t('documents.info')}>
                {receivableOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('purchases.goodsReceipts.noReceivableOrders')}</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="purchaseOrderId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('purchases.goodsReceipts.purchaseOrder')}</FormLabel>
                          <DocumentPicker
                            documents={orderDocuments}
                            value={field.value}
                            onChange={(id) => field.onChange(id)}
                            placeholder={t('purchases.goodsReceipts.pickOrder')}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="warehouseId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('purchases.goodsReceipts.warehouse')}</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={t('documents.selectPlaceholder')} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(warehouses ?? []).map((warehouse) => (
                                <SelectItem key={warehouse.id} value={warehouse.id}>
                                  {warehouse.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="receivedDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('purchases.goodsReceipts.receivedDate')}</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={field.value ?? ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {foreignCurrency ? (
                      <FormField
                        control={form.control}
                        name="exchangeRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('purchases.goodsReceipts.exchangeRate', { from: foreignCurrency, to: tenantCurrency })}</FormLabel>
                            <FormControl>
                              <Input
                                inputMode="decimal"
                                dir="ltr"
                                className="text-end"
                                placeholder={t('purchases.goodsReceipts.exchangeRatePlaceholder')}
                                value={field.value ?? ''}
                                onChange={(e) => {
                                  const value = toWesternDigits(e.target.value).trim();
                                  field.onChange(value === '' ? null : value);
                                }}
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">{t('purchases.goodsReceipts.exchangeRateHelp')}</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : null}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title={t('documents.lines')}
                actions={
                  remainingLines.some((l) => l.remaining > 0) ? (
                    <Button type="button" variant="outline" size="sm" onClick={receiveAll}>
                      <ListChecks />
                      {t('purchases.goodsReceipts.receiveAll')}
                    </Button>
                  ) : null
                }
                flush
              >
                {!purchaseOrderId ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('purchases.goodsReceipts.pickOrderFirst')}</p>
                ) : remainingLoading ? (
                  <Skeleton className="m-5 h-24" />
                ) : (
                  <div className="overflow-x-auto">
                    <GoodsReceiptLineItemsEditor remainingLines={remainingLines} drafts={drafts} onChange={setDrafts} />
                  </div>
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
                ...(order ? [{ label: t('purchases.goodsReceipts.purchaseOrder'), value: order.poNumber }] : []),
                { label: t('documents.linesCount'), value: touched.length },
              ]}
              totalLabel={t('documents.quantityTotal')}
              totalValue={<span className="tabular-nums">{quantityTotal}</span>}
              footer={
                <Button type="submit" size="lg" disabled={createReceipt.isPending}>
                  {t('documents.saveDraft')}
                </Button>
              }
            />
          }
        />
      </form>
    </Form>
  );
}
