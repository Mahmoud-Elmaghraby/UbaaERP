import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createGoodsReceiptSchema,
  type CreateGoodsReceiptDto,
  type CreateGoodsReceiptLineDto,
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
import { usePurchaseOrders } from '../../api/purchase-orders/queries';
import { useCreateGoodsReceipt } from '../../api/goods-receipts/queries';
import { usePurchaseOrderRemaining } from '../../hooks/goods-receipts/use-purchase-order-remaining';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits } from '../../../../lib/money';
import {
  createEmptyGoodsReceiptDrafts,
  GoodsReceiptLineItemsEditor,
  type GoodsReceiptLineDrafts,
} from './goods-receipt-line-items-editor';

const GOODS_RECEIPT_ENTITY_TYPE = 'goods_receipt';

type HeaderFormValues = Omit<CreateGoodsReceiptDto, 'lines'>;

/** Builds the submitted line list from the receiving worksheet's drafts — only rows with
 * a positive quantityReceived are included (a partial receipt is normal), and an invalid
 * quantity (non-numeric, <= 0, or exceeding what's remaining) on any touched row fails
 * the whole submission rather than silently dropping it. An empty unitCost draft is
 * omitted entirely so the server falls back to the purchase order line's own price. */
function prepareLines(
  remainingLines: { purchaseOrderLineId: string; remaining: number; unitPrice: { currency: string } }[],
  drafts: GoodsReceiptLineDrafts,
): CreateGoodsReceiptLineDto[] | null {
  const prepared: CreateGoodsReceiptLineDto[] = [];
  for (const line of remainingLines) {
    const draft = drafts[line.purchaseOrderLineId];
    if (!draft || draft.quantityReceived.trim() === '') continue;
    const quantityReceived = Number(draft.quantityReceived);
    if (!Number.isFinite(quantityReceived) || quantityReceived <= 0 || quantityReceived > line.remaining) {
      return null;
    }
    let unitCost: CreateGoodsReceiptLineDto['unitCost'];
    if (draft.unitCost.trim() !== '') {
      try {
        unitCost = { amountMinorUnits: decimalToMinorUnits(draft.unitCost), currency: line.unitPrice.currency };
      } catch {
        return null;
      }
    }
    prepared.push({
      purchaseOrderLineId: line.purchaseOrderLineId,
      quantityReceived,
      unitCost,
      notes: draft.notes.trim() === '' ? undefined : draft.notes,
    });
  }
  return prepared.length > 0 ? prepared : null;
}

export function CreateGoodsReceiptForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createReceipt = useCreateGoodsReceipt();
  const { data: purchaseOrders } = usePurchaseOrders();
  const { data: warehouses } = useWarehouses();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(GOODS_RECEIPT_ENTITY_TYPE);
  const [drafts, setDrafts] = useState<GoodsReceiptLineDrafts>({});
  const [linesError, setLinesError] = useState<string | null>(null);

  // Goods can only be received against a PO that's been confirmed (or already
  // partially received) — matches GoodsReceiptsService.create()'s own status check.
  const receivableOrders = useMemo(
    () => (purchaseOrders ?? []).filter((po) => po.status === 'confirmed' || po.status === 'partially_received'),
    [purchaseOrders],
  );

  const formSchema = useMemo(() => {
    const staticSchema = createGoodsReceiptSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      purchaseOrderId: receivableOrders[0]?.id ?? '',
      warehouseId: warehouses?.[0]?.id ?? '',
      receivedDate: '',
      notes: '',
      customFields: {},
    },
  });

  const selectedPurchaseOrderId = form.watch('purchaseOrderId');
  const { lines: remainingLines, isLoading: remainingLoading } = usePurchaseOrderRemaining(selectedPurchaseOrderId);

  // The receiving worksheet's rows depend entirely on which PO is selected — reset the
  // drafts whenever that changes (including the very first time remainingLines loads),
  // rather than trying to carry over stale per-line drafts across a different PO.
  useEffect(() => {
    setDrafts(createEmptyGoodsReceiptDrafts(remainingLines));
  }, [selectedPurchaseOrderId, remainingLines.length]);

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const preparedLines = prepareLines(remainingLines, drafts);
    if (!preparedLines) {
      setLinesError(t('purchases.goodsReceipts.linesError'));
      return;
    }
    try {
      await createReceipt.mutateAsync({
        ...headerValues,
        receivedDate: headerValues.receivedDate || undefined,
        lines: preparedLines,
      });
      toast.success(t('purchases.goodsReceipts.createSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.goodsReceipts.createError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (receivableOrders.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('purchases.goodsReceipts.noReceivableOrders')}</p>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="purchaseOrderId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.goodsReceipts.purchaseOrder')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {receivableOrders.map((po) => (
                    <SelectItem key={po.id} value={po.id}>
                      {po.poNumber}
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
              <FormLabel>{t('purchases.goodsReceipts.warehouse')}</FormLabel>
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
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.goodsReceipts.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.goodsReceipts.lines')}</p>
        {remainingLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <GoodsReceiptLineItemsEditor remainingLines={remainingLines} drafts={drafts} onChange={setDrafts} />
        )}
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('purchases.goodsReceipts.customFields')}</p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={createReceipt.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
