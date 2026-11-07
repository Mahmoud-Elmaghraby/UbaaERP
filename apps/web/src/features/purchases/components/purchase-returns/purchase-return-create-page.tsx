import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createPurchaseReturnSchema, type CreatePurchaseReturnDto, type CreatePurchaseReturnLineDto } from '@erp-platform/contracts';
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
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useCustomFieldDefinitions } from '../../../settings/queries';
import { useGoodsReceipts } from '../../api/goods-receipts/queries';
import { usePurchaseOrders } from '../../api/purchase-orders/queries';
import { useSuppliers } from '../../api/suppliers/queries';
import { useCreatePurchaseReturn } from '../../api/purchase-returns/queries';
import { useGoodsReceiptReturnable, type ReturnableReceiptLine } from '../../hooks/purchase-returns/use-goods-receipt-returnable';
import { ApiError } from '../../../../lib/api-client';
import { toWesternDigits } from '../../../../lib/search-normalize';
import { useSaveShortcut } from '../../../../lib/use-save-shortcut';
import { DocumentPicker, type PickableDocument } from '../../../../components/document/document-picker';
import { DocumentBody, DocumentHeaderBar, SectionCard, TotalsPanel } from '../../../../components/document/document-layout';
import {
  createEmptyPurchaseReturnDrafts,
  PurchaseReturnLineItemsEditor,
  type PurchaseReturnLineDrafts,
} from './purchase-return-line-items-editor';
import { PURCHASE_RETURNS_PATH, purchaseReturnStatusLabelKey } from './purchase-return-status';

const PURCHASE_RETURN_ENTITY_TYPE = 'purchase_return';

type HeaderFormValues = Omit<CreatePurchaseReturnDto, 'lines'>;

/** Rows with a quantity typed become lines (a partial return is normal); a bad quantity on a
 * touched row fails the whole save rather than being dropped. */
function prepareLines(returnableLines: ReturnableReceiptLine[], drafts: PurchaseReturnLineDrafts): CreatePurchaseReturnLineDto[] | null {
  const prepared: CreatePurchaseReturnLineDto[] = [];
  for (const line of returnableLines) {
    const draft = drafts[line.goodsReceiptLineId];
    if (!draft || draft.quantityReturned.trim() === '') continue;
    const quantityReturned = Number(toWesternDigits(draft.quantityReturned));
    if (!Number.isFinite(quantityReturned) || quantityReturned <= 0 || quantityReturned > line.remaining) return null;
    prepared.push({
      goodsReceiptLineId: line.goodsReceiptLineId,
      quantityReturned,
      reason: draft.reason.trim() === '' ? undefined : draft.reason,
      notes: draft.notes.trim() === '' ? undefined : draft.notes,
    });
  }
  return prepared.length > 0 ? prepared : null;
}

/** /purchases/purchase-returns/new[?goodsReceiptId=] — return goods from a confirmed receipt.
 * Confirming the return later issues a debit note for its invoiced part. */
export function PurchaseReturnCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const createReturn = useCreatePurchaseReturn();
  const { data: receipts, isLoading: receiptsLoading } = useGoodsReceipts();
  const { data: orders } = usePurchaseOrders();
  const { data: suppliers } = useSuppliers();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(PURCHASE_RETURN_ENTITY_TYPE);
  const [drafts, setDrafts] = useState<PurchaseReturnLineDrafts>({});
  const [linesError, setLinesError] = useState<string | null>(null);

  // Only a confirmed receipt (goods actually in stock) can be returned against.
  const returnableReceipts = useMemo(() => (receipts ?? []).filter((r) => r.status === 'confirmed'), [receipts]);
  const receiptDocuments = useMemo<PickableDocument[]>(() => {
    const orderById = new Map((orders ?? []).map((o) => [o.id, o]));
    const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
    return returnableReceipts.map((r) => {
      const order = orderById.get(r.purchaseOrderId);
      return {
        id: r.id,
        number: r.receiptNumber,
        date: r.receivedDate ?? String(r.createdAt),
        party: order ? (supplierName.get(order.supplierId) ?? null) : null,
      };
    });
  }, [returnableReceipts, orders, suppliers]);

  const formSchema = useMemo(() => {
    const staticSchema = createPurchaseReturnSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      goodsReceiptId: params.get('goodsReceiptId') ?? '',
      returnDate: new Date().toISOString().slice(0, 10),
      notes: '',
      customFields: {},
    },
  });

  const goodsReceiptId = form.watch('goodsReceiptId');
  const { lines: returnableLines, isLoading: returnableLoading } = useGoodsReceiptReturnable(goodsReceiptId || null);
  const pickedDocument = receiptDocuments.find((d) => d.id === goodsReceiptId);

  useEffect(() => {
    setDrafts(createEmptyPurchaseReturnDrafts(returnableLines));
  }, [goodsReceiptId, returnableLines.length]);

  const touched = returnableLines.filter((l) => (drafts[l.goodsReceiptLineId]?.quantityReturned ?? '').trim() !== '');
  const quantityTotal = touched.reduce((sum, l) => sum + (Number(toWesternDigits(drafts[l.goodsReceiptLineId]!.quantityReturned)) || 0), 0);

  async function onSubmit(values: HeaderFormValues) {
    setLinesError(null);
    if (!values.goodsReceiptId) {
      form.setError('goodsReceiptId', { message: t('purchases.purchaseReturns.receiptRequired') });
      return;
    }
    const prepared = prepareLines(returnableLines, drafts);
    if (!prepared) {
      setLinesError(t('purchases.purchaseReturns.linesError'));
      return;
    }
    try {
      const saved = await createReturn.mutateAsync({ ...values, returnDate: values.returnDate || undefined, lines: prepared });
      toast.success(t('purchases.purchaseReturns.createSuccess'));
      navigate(`${PURCHASE_RETURNS_PATH}/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.purchaseReturns.createError'));
    }
  }

  useSaveShortcut(() => void form.handleSubmit(onSubmit)(), createReturn.isPending);

  if (definitionsLoading || receiptsLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DocumentHeaderBar
          backTo={PURCHASE_RETURNS_PATH}
          backLabel={t('documents.back')}
          eyebrow={t('purchases.tabs.purchaseReturns')}
          title={t('purchases.purchaseReturns.newReturn')}
          status={<Badge variant="neutral">{t(purchaseReturnStatusLabelKey('draft'))}</Badge>}
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
                {returnableReceipts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('purchases.purchaseReturns.noReturnableReceipts')}</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="goodsReceiptId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('purchases.purchaseReturns.goodsReceipt')}</FormLabel>
                          <DocumentPicker
                            documents={receiptDocuments}
                            value={field.value}
                            onChange={(id) => field.onChange(id)}
                            placeholder={t('purchases.purchaseReturns.pickReceipt')}
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
                          <FormLabel>{t('purchases.purchaseReturns.returnDate')}</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={field.value ?? ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </SectionCard>

              <SectionCard title={t('documents.lines')} flush>
                {!goodsReceiptId ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('purchases.purchaseReturns.pickReceiptFirst')}</p>
                ) : returnableLoading ? (
                  <Skeleton className="m-5 h-24" />
                ) : (
                  <div className="overflow-x-auto">
                    <PurchaseReturnLineItemsEditor returnableLines={returnableLines} drafts={drafts} onChange={setDrafts} />
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
                ...(pickedDocument?.party ? [{ label: t('purchases.purchaseOrders.supplier'), value: pickedDocument.party }] : []),
                { label: t('documents.linesCount'), value: touched.length },
              ]}
              totalLabel={t('documents.quantityTotal')}
              totalValue={<span className="tabular-nums">{quantityTotal}</span>}
              footer={
                <>
                  <Button type="submit" size="lg" disabled={createReturn.isPending}>
                    {t('documents.saveDraft')}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">{t('purchases.purchaseReturns.debitNoteHint')}</p>
                </>
              }
            />
          }
        />
      </form>
    </Form>
  );
}
