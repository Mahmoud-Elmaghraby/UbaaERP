import { useEffect, useMemo, useState } from 'react';
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
import { useDeliveries } from '../../api/deliveries/queries';
import { useCreateSalesReturn } from '../../api/sales-returns/queries';
import { useDeliveryReturnable } from '../../hooks/sales-returns/use-delivery-returnable';
import { ApiError } from '../../../../lib/api-client';
import {
  createEmptySalesReturnDrafts,
  SalesReturnLineItemsEditor,
  type SalesReturnLineDrafts,
} from './sales-return-line-items-editor';

const SALES_RETURN_ENTITY_TYPE = 'sales_return';

/** Only rows with a positive quantityReturned are included (a partial return is normal);
 * an invalid quantity (non-numeric, <= 0, or exceeding what's remaining) on any touched
 * row fails the whole submission rather than silently dropping it. */
function prepareLines(
  returnableLines: { deliveryLineId: string; remaining: number }[],
  drafts: SalesReturnLineDrafts,
): CreateSalesReturnLineDto[] | null {
  const prepared: CreateSalesReturnLineDto[] = [];
  for (const line of returnableLines) {
    const draft = drafts[line.deliveryLineId];
    if (!draft || draft.quantityReturned.trim() === '') continue;
    const quantityReturned = Number(draft.quantityReturned);
    if (!Number.isFinite(quantityReturned) || quantityReturned <= 0 || quantityReturned > line.remaining) {
      return null;
    }
    prepared.push({
      deliveryLineId: line.deliveryLineId,
      quantityReturned,
      reason: draft.reason.trim() === '' ? undefined : draft.reason,
      notes: draft.notes.trim() === '' ? undefined : draft.notes,
    });
  }
  return prepared.length > 0 ? prepared : null;
}

export function CreateSalesReturnForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createReturn = useCreateSalesReturn();
  const { data: deliveries } = useDeliveries();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(SALES_RETURN_ENTITY_TYPE);
  const [drafts, setDrafts] = useState<SalesReturnLineDrafts>({});
  const [linesError, setLinesError] = useState<string | null>(null);

  // Only a confirmed delivery (one that actually shipped) can have anything returned
  // against it — matches SalesReturnsService.create()'s own check.
  const returnableDeliveries = useMemo(
    () => (deliveries ?? []).filter((delivery) => delivery.status === 'confirmed'),
    [deliveries],
  );

  const formSchema = useMemo(() => {
    const staticSchema = createSalesReturnSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<Omit<CreateSalesReturnDto, 'lines'>>({
    resolver: zodResolver(formSchema as z.ZodType<Omit<CreateSalesReturnDto, 'lines'>>),
    defaultValues: {
      deliveryId: returnableDeliveries[0]?.id ?? '',
      returnDate: '',
      notes: '',
      customFields: {},
    },
  });

  const selectedDeliveryId = form.watch('deliveryId');
  const { lines: returnableLines, isLoading: returnableLoading } = useDeliveryReturnable(selectedDeliveryId);

  // The returnable worksheet's rows depend entirely on which delivery is selected —
  // reset the drafts whenever that changes, same as the delivering worksheet.
  useEffect(() => {
    setDrafts(createEmptySalesReturnDrafts(returnableLines));
  }, [selectedDeliveryId, returnableLines.length]);

  async function onSubmit(headerValues: Omit<CreateSalesReturnDto, 'lines'>) {
    setLinesError(null);
    const preparedLines = prepareLines(returnableLines, drafts);
    if (!preparedLines) {
      setLinesError(t('sales.salesReturns.linesError'));
      return;
    }
    try {
      await createReturn.mutateAsync({
        ...headerValues,
        returnDate: headerValues.returnDate || undefined,
        lines: preparedLines,
      });
      toast.success(t('sales.salesReturns.createSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.salesReturns.createError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (returnableDeliveries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('sales.salesReturns.noReturnableDeliveries')}</p>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="deliveryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.salesReturns.delivery')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {returnableDeliveries.map((delivery) => (
                    <SelectItem key={delivery.id} value={delivery.id}>
                      {delivery.deliveryNumber}
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
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.salesReturns.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('sales.salesReturns.lines')}</p>
        {returnableLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <SalesReturnLineItemsEditor returnableLines={returnableLines} drafts={drafts} onChange={setDrafts} />
        )}
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('sales.salesReturns.customFields')}</p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={createReturn.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
