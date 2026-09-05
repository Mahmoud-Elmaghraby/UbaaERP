import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createPurchaseReturnSchema,
  type CreatePurchaseReturnDto,
  type CreatePurchaseReturnLineDto,
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
import { useGoodsReceipts } from '../../api/goods-receipts/queries';
import { useCreatePurchaseReturn } from '../../api/purchase-returns/queries';
import { useGoodsReceiptReturnable } from '../../hooks/purchase-returns/use-goods-receipt-returnable';
import { ApiError } from '../../../../lib/api-client';
import {
  createEmptyPurchaseReturnDrafts,
  PurchaseReturnLineItemsEditor,
  type PurchaseReturnLineDrafts,
} from './purchase-return-line-items-editor';

const PURCHASE_RETURN_ENTITY_TYPE = 'purchase_return';

type HeaderFormValues = Omit<CreatePurchaseReturnDto, 'lines'>;

/** Only rows with a positive quantityReturned are included (a partial return is normal);
 * an invalid quantity (non-numeric, <= 0, or exceeding what's remaining) on any touched
 * row fails the whole submission rather than silently dropping it. */
function prepareLines(
  returnableLines: { goodsReceiptLineId: string; remaining: number }[],
  drafts: PurchaseReturnLineDrafts,
): CreatePurchaseReturnLineDto[] | null {
  const prepared: CreatePurchaseReturnLineDto[] = [];
  for (const line of returnableLines) {
    const draft = drafts[line.goodsReceiptLineId];
    if (!draft || draft.quantityReturned.trim() === '') continue;
    const quantityReturned = Number(draft.quantityReturned);
    if (!Number.isFinite(quantityReturned) || quantityReturned <= 0 || quantityReturned > line.remaining) {
      return null;
    }
    prepared.push({
      goodsReceiptLineId: line.goodsReceiptLineId,
      quantityReturned,
      reason: draft.reason.trim() === '' ? undefined : draft.reason,
      notes: draft.notes.trim() === '' ? undefined : draft.notes,
    });
  }
  return prepared.length > 0 ? prepared : null;
}

export function CreatePurchaseReturnForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createReturn = useCreatePurchaseReturn();
  const { data: goodsReceipts } = useGoodsReceipts();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(PURCHASE_RETURN_ENTITY_TYPE);
  const [drafts, setDrafts] = useState<PurchaseReturnLineDrafts>({});
  const [linesError, setLinesError] = useState<string | null>(null);

  // Only a confirmed goods receipt (one that actually arrived in stock) can have
  // anything returned against it — matches PurchaseReturnsService.create()'s own check.
  const returnableReceipts = useMemo(
    () => (goodsReceipts ?? []).filter((receipt) => receipt.status === 'confirmed'),
    [goodsReceipts],
  );

  const formSchema = useMemo(() => {
    const staticSchema = createPurchaseReturnSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      goodsReceiptId: returnableReceipts[0]?.id ?? '',
      returnDate: '',
      notes: '',
      customFields: {},
    },
  });

  const selectedGoodsReceiptId = form.watch('goodsReceiptId');
  const { lines: returnableLines, isLoading: returnableLoading } = useGoodsReceiptReturnable(selectedGoodsReceiptId);

  // The returnable worksheet's rows depend entirely on which goods receipt is selected —
  // reset the drafts whenever that changes, same as the receiving worksheet in Stage 5.
  useEffect(() => {
    setDrafts(createEmptyPurchaseReturnDrafts(returnableLines));
  }, [selectedGoodsReceiptId, returnableLines.length]);

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const preparedLines = prepareLines(returnableLines, drafts);
    if (!preparedLines) {
      setLinesError(t('purchases.purchaseReturns.linesError'));
      return;
    }
    try {
      await createReturn.mutateAsync({
        ...headerValues,
        returnDate: headerValues.returnDate || undefined,
        lines: preparedLines,
      });
      toast.success(t('purchases.purchaseReturns.createSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.purchaseReturns.createError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (returnableReceipts.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('purchases.purchaseReturns.noReturnableReceipts')}</p>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="goodsReceiptId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.purchaseReturns.goodsReceipt')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {returnableReceipts.map((receipt) => (
                    <SelectItem key={receipt.id} value={receipt.id}>
                      {receipt.receiptNumber}
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
              <FormLabel>{t('purchases.purchaseReturns.returnDate')}</FormLabel>
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
              <FormLabel>{t('purchases.purchaseReturns.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.purchaseReturns.lines')}</p>
        {returnableLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <PurchaseReturnLineItemsEditor returnableLines={returnableLines} drafts={drafts} onChange={setDrafts} />
        )}
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('purchases.purchaseReturns.customFields')}</p>
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
