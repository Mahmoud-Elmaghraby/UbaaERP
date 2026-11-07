import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createDeliverySchema,
  type CreateDeliveryDto,
  type CreateDeliveryLineDto,
  type DeliveryLotDto,
} from '@erp-platform/contracts';
import {
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useCustomFieldDefinitions } from '../../../settings/queries';
import { useWarehouses } from '../../../inventory/api/warehouses/queries';
import { useVariantLookupMap } from '../../../inventory/api/products/queries';
import { useCustomers } from '../../api/customers/queries';
import { useSalesOrders } from '../../api/sales-orders/queries';
import { useCreateDelivery } from '../../api/deliveries/queries';
import { useSalesOrderRemaining, type RemainingSoLine } from '../../hooks/deliveries/use-sales-order-remaining';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { ApiError } from '../../../../lib/api-client';
import { todayIso } from '../../../../lib/format-date';
import { DocumentBody, DocumentHeaderBar, SectionCard } from '../../../../components/document/document-layout';
import { DocumentPicker, type PickableDocument } from '../../../../components/document/document-picker';
import { DeliveryLotsPicker } from '../../../../components/document/lot-entry';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { findUnit } from '../../../../components/product/variant-search';
import { DELIVERIES_PATH } from './delivery-status';

const DELIVERY_ENTITY_TYPE = 'delivery';
type HeaderFormValues = Omit<CreateDeliveryDto, 'lines'>;

interface LineDraft {
  quantity: string;
  notes: string;
  /** Picked lots for a lot/serial-tracked line; empty = automatic FEFO. */
  lots: DeliveryLotDto[];
}
type LineDrafts = Record<string, LineDraft>;

/** Each open line starts at its full remaining quantity — the usual case is delivering everything left. */
function defaultDrafts(lines: RemainingSoLine[]): LineDrafts {
  const drafts: LineDrafts = {};
  for (const line of lines) {
    if (line.remaining > 0) drafts[line.salesOrderLineId] = { quantity: String(line.remaining), notes: '', lots: [] };
  }
  return drafts;
}

/** Lines at 0/empty are skipped (partial delivery is normal); an invalid or over-remaining quantity fails the save. */
function prepareLines(lines: RemainingSoLine[], drafts: LineDrafts): CreateDeliveryLineDto[] | string {
  const prepared: CreateDeliveryLineDto[] = [];
  for (const line of lines) {
    const draft = drafts[line.salesOrderLineId];
    if (!draft || draft.quantity.trim() === '' || Number(draft.quantity) === 0) continue;
    const quantity = Number(draft.quantity);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > line.remaining + 1e-9) {
      return 'sales.deliveries.linesError';
    }
    // Picked lots are optional (none = FEFO), but when picked they must cover the quantity.
    if (draft.lots.length > 0 && Math.abs(draft.lots.reduce((sum, lot) => sum + lot.quantity, 0) - quantity) > 1e-6) {
      return 'lots.errors.pickMismatch';
    }
    prepared.push({
      salesOrderLineId: line.salesOrderLineId,
      quantityDelivered: quantity,
      notes: draft.notes.trim() === '' ? undefined : draft.notes,
      lots: draft.lots.length > 0 ? draft.lots : undefined,
    });
  }
  return prepared.length > 0 ? prepared : 'sales.deliveries.linesError';
}

/** /sales/deliveries/new[?salesOrderId=] — deliver an order's open lines as a full page. */
export function DeliveryCreatePage() {
  const { isLoading } = useCustomFieldDefinitions(DELIVERY_ENTITY_TYPE);
  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  return <DeliveryEditor />;
}

function DeliveryEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const createDelivery = useCreateDelivery();
  const { data: definitions } = useCustomFieldDefinitions(DELIVERY_ENTITY_TYPE);
  const { data: salesOrders } = useSalesOrders();
  const { data: customers } = useCustomers();
  const { data: warehouses } = useWarehouses();
  const [drafts, setDrafts] = useState<LineDrafts>({});
  const [linesError, setLinesError] = useState<string | null>(null);

  // Only a confirmed (or partly delivered) order can be delivered — DeliveriesService.create() checks the same.
  const orderDocuments = useMemo<PickableDocument[]>(() => {
    const customerById = new Map((customers ?? []).map((c) => [c.id, c.name]));
    return (salesOrders ?? [])
      .filter((so) => so.status === 'confirmed' || so.status === 'partially_delivered')
      .map((so) => ({
        id: so.id,
        number: so.soNumber,
        date: String(so.createdAt instanceof Date ? so.createdAt.toISOString() : so.createdAt),
        party: customerById.get(so.customerId) ?? null,
      }));
  }, [salesOrders, customers]);

  const formSchema = useMemo(() => {
    const staticSchema = createDeliverySchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      salesOrderId: params.get('salesOrderId') ?? '',
      warehouseId: '',
      deliveryDate: todayIso(),
      notes: '',
      customFields: {},
    },
  });

  useEffect(() => {
    if (!form.getValues('warehouseId') && warehouses?.[0]) form.setValue('warehouseId', warehouses[0].id);
  }, [warehouses, form]);

  const salesOrderId = form.watch('salesOrderId');
  const warehouseId = form.watch('warehouseId');
  const { lines, isLoading: linesLoading } = useSalesOrderRemaining(salesOrderId || null);

  // Rebuild the worksheet once the chosen order's remaining quantities have loaded.
  useEffect(() => {
    if (!linesLoading) setDrafts(defaultDrafts(lines));
    setLinesError(null);
    // `lines` is rebuilt every render, so reset only on order change / load.
  }, [salesOrderId, linesLoading]);

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const prepared = prepareLines(lines, drafts);
    if (typeof prepared === 'string') {
      setLinesError(t(prepared));
      return;
    }
    try {
      const saved = await createDelivery.mutateAsync({
        ...headerValues,
        deliveryDate: headerValues.deliveryDate || undefined,
        notes: headerValues.notes || undefined,
        lines: prepared,
      });
      toast.success(t('sales.deliveries.createSuccess'));
      navigate(`${DELIVERIES_PATH}/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.deliveries.createError'));
    }
  }

  // Ctrl/⌘+S saves.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void form.handleSubmit(onSubmit)();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DocumentHeaderBar
          backTo={DELIVERIES_PATH}
          backLabel={t('sales.tabs.deliveries')}
          eyebrow={t('sales.tabs.deliveries')}
          title={t('sales.deliveries.newDelivery')}
          actions={
            <>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createDelivery.isPending} title="Ctrl+S">
                {t('documents.saveDraft')}
              </Button>
            </>
          }
        />
        <DocumentBody
          main={
            <>
              <SectionCard title={t('documents.info')}>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px_180px]">
                  <FormField
                    control={form.control}
                    name="salesOrderId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('sales.deliveries.salesOrder')}</FormLabel>
                        <DocumentPicker
                          documents={orderDocuments}
                          value={field.value}
                          onChange={(id) => field.onChange(id)}
                          placeholder={t('sales.deliveries.pickOrder')}
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
                        <FormLabel>{t('sales.deliveries.warehouse')}</FormLabel>
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
                    name="deliveryDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('sales.deliveries.deliveryDate')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {orderDocuments.length === 0 && salesOrders ? (
                  <p className="mt-3 text-sm text-muted-foreground">{t('sales.deliveries.noDeliverableOrders')}</p>
                ) : null}
              </SectionCard>

              <SectionCard title={t('documents.lines')} flush>
                {!salesOrderId ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('sales.deliveries.pickOrderFirst')}</p>
                ) : linesLoading ? (
                  <div className="p-5">
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : (
                  <DeliveryWorksheet lines={lines} drafts={drafts} onChange={setDrafts} warehouseId={warehouseId} />
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
                        <Textarea rows={2} {...field} value={field.value ?? ''} />
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
        />
      </form>
    </Form>
  );
}

/**
 * One row per open order line: ordered / already delivered / remaining, and the
 * "deliver now" quantity. A lot/serial-tracked line gets a lot picker under it
 * (no picks = the backend takes lots first-expiry-first-out).
 */
function DeliveryWorksheet({
  lines,
  drafts,
  onChange,
  warehouseId,
}: {
  lines: RemainingSoLine[];
  drafts: LineDrafts;
  onChange: (drafts: LineDrafts) => void;
  warehouseId: string;
}) {
  const { t } = useTranslation();
  const variantIndex = useVariantIndex();
  const variants = useVariantLookupMap();
  const openLines = lines.filter((line) => line.remaining > 0);

  function update(lineId: string, patch: Partial<LineDraft>) {
    const current = drafts[lineId] ?? { quantity: '', notes: '', lots: [] };
    onChange({ ...drafts, [lineId]: { ...current, ...patch } });
  }

  if (openLines.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('sales.deliveries.nothingRemaining')}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-10 text-center">#</TableHead>
          <TableHead>{t('sales.deliveries.lineProduct')}</TableHead>
          <TableHead className="text-end">{t('sales.deliveries.lineOrdered')}</TableHead>
          <TableHead className="text-end">{t('sales.deliveries.lineAlreadyDelivered')}</TableHead>
          <TableHead className="text-end">{t('sales.deliveries.lineRemaining')}</TableHead>
          <TableHead className="w-32">{t('sales.deliveries.lineDeliverNow')}</TableHead>
          <TableHead>{t('sales.deliveries.lineNotes')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {openLines.map((line, index) => {
          const draft = drafts[line.salesOrderLineId] ?? { quantity: '', notes: '', lots: [] };
          const variant = variantIndex.get(line.productVariantId);
          const trackingType = variant?.trackingType ?? 'none';
          const quantity = Number(draft.quantity) || 0;
          const showLots = quantity > 0 && Boolean(warehouseId);
          const qty = (value: number) => (
            <QuantityWithUnit quantity={value} productVariantId={line.productVariantId} unitOfMeasureId={line.unitOfMeasureId} />
          );
          return (
            <Fragment key={line.salesOrderLineId}>
              <TableRow className={showLots && trackingType !== 'none' ? 'border-b-0' : undefined}>
                <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                <TableCell>
                  <div className="flex flex-col leading-snug">
                    <span className="font-medium">{variant?.productName ?? '—'}</span>
                    <span className="text-xs text-muted-foreground">{variant?.sku}</span>
                  </div>
                </TableCell>
                <TableCell className="text-end">{qty(line.ordered)}</TableCell>
                <TableCell className="text-end text-muted-foreground">{qty(line.delivered)}</TableCell>
                <TableCell className="text-end font-medium">{qty(line.remaining)}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    max={line.remaining}
                    step="any"
                    inputMode="decimal"
                    className="tabular-nums"
                    value={draft.quantity}
                    onChange={(e) => update(line.salesOrderLineId, { quantity: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input value={draft.notes} onChange={(e) => update(line.salesOrderLineId, { notes: e.target.value })} />
                </TableCell>
              </TableRow>
              {showLots && trackingType !== 'none' ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="pt-0">
                    <DeliveryLotsPicker
                      productVariantId={line.productVariantId}
                      unitFactor={findUnit(variants.get(line.productVariantId), line.unitOfMeasureId)?.factor ?? 1}
                      warehouseId={warehouseId}
                      trackingType={trackingType}
                      quantity={quantity}
                      value={draft.lots}
                      onChange={(lots) => update(line.salesOrderLineId, { lots })}
                    />
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
