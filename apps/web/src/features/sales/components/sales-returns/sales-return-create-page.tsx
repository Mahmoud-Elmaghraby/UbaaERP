import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createSalesReturnSchema,
  type CreateSalesReturnDto,
  type CreateSalesReturnLineDto,
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
import { useCustomers } from '../../api/customers/queries';
import { useDeliveries } from '../../api/deliveries/queries';
import { useSalesOrders } from '../../api/sales-orders/queries';
import { useCreateSalesReturn } from '../../api/sales-returns/queries';
import { useDeliveryReturnable, type ReturnableDeliveryLine } from '../../hooks/sales-returns/use-delivery-returnable';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { ApiError } from '../../../../lib/api-client';
import { todayIso } from '../../../../lib/format-date';
import { DocumentBody, DocumentHeaderBar, SectionCard } from '../../../../components/document/document-layout';
import { DocumentPicker, type PickableDocument } from '../../../../components/document/document-picker';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { SALES_RETURNS_PATH } from './sales-return-status';

const SALES_RETURN_ENTITY_TYPE = 'sales_return';
type HeaderFormValues = Omit<CreateSalesReturnDto, 'lines'>;

interface LineDraft {
  quantity: string;
  reason: string;
}
type LineDrafts = Record<string, LineDraft>;

function defaultDrafts(lines: ReturnableDeliveryLine[]): LineDrafts {
  const drafts: LineDrafts = {};
  for (const line of lines) drafts[line.deliveryLineId] = { quantity: '0', reason: '' };
  return drafts;
}

/** Only lines with a positive "return now" are sent; an invalid or over-returnable quantity fails the save. */
function prepareLines(lines: ReturnableDeliveryLine[], drafts: LineDrafts): CreateSalesReturnLineDto[] | null {
  const prepared: CreateSalesReturnLineDto[] = [];
  for (const line of lines) {
    const draft = drafts[line.deliveryLineId];
    if (!draft || draft.quantity.trim() === '' || Number(draft.quantity) === 0) continue;
    const quantity = Number(draft.quantity);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > line.remaining + 1e-9) return null;
    prepared.push({
      deliveryLineId: line.deliveryLineId,
      quantityReturned: quantity,
      reason: draft.reason.trim() === '' ? undefined : draft.reason.trim(),
    });
  }
  return prepared.length > 0 ? prepared : null;
}

/** /sales/sales-returns/new[?deliveryId=] — return goods from a confirmed delivery as a full page. */
export function SalesReturnCreatePage() {
  const { isLoading } = useCustomFieldDefinitions(SALES_RETURN_ENTITY_TYPE);
  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  return <SalesReturnEditor />;
}

function SalesReturnEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const createReturn = useCreateSalesReturn();
  const { data: definitions } = useCustomFieldDefinitions(SALES_RETURN_ENTITY_TYPE);
  const { data: deliveries } = useDeliveries();
  const { data: salesOrders } = useSalesOrders();
  const { data: customers } = useCustomers();
  const [drafts, setDrafts] = useState<LineDrafts>({});
  const [linesError, setLinesError] = useState<string | null>(null);

  // Only a confirmed delivery (goods actually left) can be returned against — SalesReturnsService.create() checks the same.
  const deliveryDocuments = useMemo<PickableDocument[]>(() => {
    const customerBySo = new Map((salesOrders ?? []).map((so) => [so.id, so.customerId]));
    const customerById = new Map((customers ?? []).map((c) => [c.id, c.name]));
    return (deliveries ?? [])
      .filter((delivery) => delivery.status === 'confirmed')
      .map((delivery) => {
        const customerId = customerBySo.get(delivery.salesOrderId);
        return {
          id: delivery.id,
          number: delivery.deliveryNumber,
          date: delivery.deliveryDate ?? String(delivery.createdAt),
          party: (customerId && customerById.get(customerId)) || null,
        };
      });
  }, [deliveries, salesOrders, customers]);

  const formSchema = useMemo(() => {
    const staticSchema = createSalesReturnSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      deliveryId: params.get('deliveryId') ?? '',
      returnDate: todayIso(),
      notes: '',
      customFields: {},
    },
  });

  const deliveryId = form.watch('deliveryId');
  const { lines, isLoading: linesLoading } = useDeliveryReturnable(deliveryId || null);

  // `lines` is rebuilt every render, so reset only on delivery change / load.
  useEffect(() => {
    if (!linesLoading) setDrafts(defaultDrafts(lines));
    setLinesError(null);
  }, [deliveryId, linesLoading]);

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const prepared = prepareLines(lines, drafts);
    if (!prepared) {
      setLinesError(t('sales.salesReturns.linesError'));
      return;
    }
    try {
      const saved = await createReturn.mutateAsync({
        ...headerValues,
        returnDate: headerValues.returnDate || undefined,
        notes: headerValues.notes || undefined,
        lines: prepared,
      });
      toast.success(t('sales.salesReturns.createSuccess'));
      navigate(`${SALES_RETURNS_PATH}/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.salesReturns.createError'));
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
          backTo={SALES_RETURNS_PATH}
          backLabel={t('sales.tabs.salesReturns')}
          eyebrow={t('sales.tabs.salesReturns')}
          title={t('sales.salesReturns.newReturn')}
          actions={
            <>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createReturn.isPending} title="Ctrl+S">
                {t('documents.saveDraft')}
              </Button>
            </>
          }
        />
        <DocumentBody
          main={
            <>
              <SectionCard title={t('documents.info')}>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                  <FormField
                    control={form.control}
                    name="deliveryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('sales.salesReturns.delivery')}</FormLabel>
                        <DocumentPicker
                          documents={deliveryDocuments}
                          value={field.value}
                          onChange={(id) => field.onChange(id)}
                          placeholder={t('sales.salesReturns.pickDelivery')}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="returnDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('sales.salesReturns.returnDate')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {deliveryDocuments.length === 0 && deliveries ? (
                  <p className="mt-3 text-sm text-muted-foreground">{t('sales.salesReturns.noReturnableDeliveries')}</p>
                ) : null}
              </SectionCard>

              <SectionCard title={t('documents.lines')} flush>
                {!deliveryId ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                    {t('sales.salesReturns.pickDeliveryFirst')}
                  </p>
                ) : linesLoading ? (
                  <div className="p-5">
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : (
                  <ReturnWorksheet lines={lines} drafts={drafts} onChange={setDrafts} />
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

/** One row per delivery line: delivered / already returned / returnable, then "return now" and a reason. */
function ReturnWorksheet({
  lines,
  drafts,
  onChange,
}: {
  lines: ReturnableDeliveryLine[];
  drafts: LineDrafts;
  onChange: (drafts: LineDrafts) => void;
}) {
  const { t } = useTranslation();
  const variantIndex = useVariantIndex();
  const openLines = lines.filter((line) => line.remaining > 0);

  function update(lineId: string, patch: Partial<LineDraft>) {
    const current = drafts[lineId] ?? { quantity: '0', reason: '' };
    onChange({ ...drafts, [lineId]: { ...current, ...patch } });
  }

  if (openLines.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('sales.salesReturns.nothingReturnable')}</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-10 text-center">#</TableHead>
          <TableHead>{t('sales.salesReturns.lineProduct')}</TableHead>
          <TableHead className="text-end">{t('sales.salesReturns.lineDelivered')}</TableHead>
          <TableHead className="text-end">{t('sales.salesReturns.lineAlreadyReturned')}</TableHead>
          <TableHead className="text-end">{t('sales.salesReturns.lineReturnable')}</TableHead>
          <TableHead className="w-32">{t('sales.salesReturns.lineReturnNow')}</TableHead>
          <TableHead className="w-48">{t('sales.salesReturns.lineReason')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {openLines.map((line, index) => {
          const draft = drafts[line.deliveryLineId] ?? { quantity: '0', reason: '' };
          const variant = variantIndex.get(line.productVariantId);
          const qty = (value: number) => (
            <QuantityWithUnit quantity={value} productVariantId={line.productVariantId} unitOfMeasureId={line.unitOfMeasureId} />
          );
          return (
            <TableRow key={line.deliveryLineId}>
              <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
              <TableCell>
                <div className="flex flex-col leading-snug">
                  <span className="font-medium">{variant?.productName ?? '—'}</span>
                  <span className="text-xs text-muted-foreground">{variant?.sku}</span>
                </div>
              </TableCell>
              <TableCell className="text-end">{qty(line.delivered)}</TableCell>
              <TableCell className="text-end text-muted-foreground">{qty(line.returned)}</TableCell>
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
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => update(line.deliveryLineId, { quantity: e.target.value })}
                />
              </TableCell>
              <TableCell>
                <Input value={draft.reason} onChange={(e) => update(line.deliveryLineId, { reason: e.target.value })} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
