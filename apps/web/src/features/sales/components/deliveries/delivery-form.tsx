import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createDeliverySchema,
  type CreateDeliveryDto,
  type CreateDeliveryLineDto,
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
  Separator,
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useCustomFieldDefinitions } from '../../../settings/queries';
import { useWarehouses } from '../../../inventory/api/warehouses/queries';
import { useSalesOrders } from '../../api/sales-orders/queries';
import { useCreateDelivery } from '../../api/deliveries/queries';
import { useSalesOrderRemaining } from '../../hooks/deliveries/use-sales-order-remaining';
import { ApiError } from '../../../../lib/api-client';
import {
  createEmptyDeliveryDrafts,
  DeliveryLineItemsEditor,
  type DeliveryLineDrafts,
} from './delivery-line-items-editor';

const DELIVERY_ENTITY_TYPE = 'delivery';

type HeaderFormValues = Omit<CreateDeliveryDto, 'lines'>;

/** Only rows with a positive quantityDelivered are included (a partial delivery against
 * a sales order is normal — matches Goods Receipts' own worksheet); an invalid quantity
 * (non-numeric, <= 0, or exceeding what's remaining) on any touched row fails the whole
 * submission rather than silently dropping it. */
function prepareLines(
  remainingLines: { salesOrderLineId: string; remaining: number }[],
  drafts: DeliveryLineDrafts,
): CreateDeliveryLineDto[] | null {
  const prepared: CreateDeliveryLineDto[] = [];
  for (const line of remainingLines) {
    const draft = drafts[line.salesOrderLineId];
    if (!draft || draft.quantityDelivered.trim() === '') continue;
    const quantityDelivered = Number(draft.quantityDelivered);
    if (!Number.isFinite(quantityDelivered) || quantityDelivered <= 0 || quantityDelivered > line.remaining) {
      return null;
    }
    prepared.push({
      salesOrderLineId: line.salesOrderLineId,
      quantityDelivered,
      notes: draft.notes.trim() === '' ? undefined : draft.notes,
    });
  }
  return prepared.length > 0 ? prepared : null;
}

export function CreateDeliveryForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createDelivery = useCreateDelivery();
  const { data: salesOrders } = useSalesOrders();
  const { data: warehouses } = useWarehouses();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(DELIVERY_ENTITY_TYPE);
  const [drafts, setDrafts] = useState<DeliveryLineDrafts>({});
  const [linesError, setLinesError] = useState<string | null>(null);

  // Goods can only be delivered against a sales order that's been confirmed (or already
  // partially delivered) — matches DeliveriesService.create()'s own status check.
  const deliverableOrders = useMemo(
    () => (salesOrders ?? []).filter((so) => so.status === 'confirmed' || so.status === 'partially_delivered'),
    [salesOrders],
  );

  const formSchema = useMemo(() => {
    const staticSchema = createDeliverySchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      salesOrderId: deliverableOrders[0]?.id ?? '',
      warehouseId: warehouses?.[0]?.id ?? '',
      deliveryDate: '',
      notes: '',
      customFields: {},
    },
  });

  const selectedSalesOrderId = form.watch('salesOrderId');
  const { lines: remainingLines, isLoading: remainingLoading } = useSalesOrderRemaining(selectedSalesOrderId);

  // The delivering worksheet's rows depend entirely on which sales order is selected —
  // reset the drafts whenever that changes (including the very first time
  // remainingLines loads), rather than trying to carry over stale per-line drafts
  // across a different order.
  useEffect(() => {
    setDrafts(createEmptyDeliveryDrafts(remainingLines));
  }, [selectedSalesOrderId, remainingLines.length]);

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const preparedLines = prepareLines(remainingLines, drafts);
    if (!preparedLines) {
      setLinesError(t('sales.deliveries.linesError'));
      return;
    }
    try {
      await createDelivery.mutateAsync({
        ...headerValues,
        deliveryDate: headerValues.deliveryDate || undefined,
        lines: preparedLines,
      });
      toast.success(t('sales.deliveries.createSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.deliveries.createError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (deliverableOrders.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('sales.deliveries.noDeliverableOrders')}</p>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="salesOrderId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.deliveries.salesOrder')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {deliverableOrders.map((so) => (
                    <SelectItem key={so.id} value={so.id}>
                      {so.soNumber}
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
          name="warehouseId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.deliveries.warehouse')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
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
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.deliveries.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('sales.deliveries.lines')}</p>
        {remainingLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <DeliveryLineItemsEditor remainingLines={remainingLines} drafts={drafts} onChange={setDrafts} />
        )}
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('sales.deliveries.customFields')}</p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={createDelivery.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
