import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createPurchaseInvoiceSchema,
  type CreatePurchaseInvoiceDto,
  type CreatePurchaseInvoiceLineDto,
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
import { usePurchaseOrders } from '../../api/purchase-orders/queries';
import { useCreatePurchaseInvoice } from '../../api/purchase-invoices/queries';
import { usePurchaseOrderInvoiceable } from '../../hooks/purchase-invoices/use-purchase-order-invoiceable';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits } from '../../../../lib/money';
import {
  createEmptyPurchaseInvoiceDrafts,
  PurchaseInvoiceLineItemsEditor,
  type PurchaseInvoiceLineDrafts,
} from './purchase-invoice-line-items-editor';

const PURCHASE_INVOICE_ENTITY_TYPE = 'purchase_invoice';

type HeaderFormValues = Omit<CreatePurchaseInvoiceDto, 'lines'>;

/** Only rows with a positive quantityInvoiced are included (a partial invoice against a
 * PO is normal — matches Goods Receipts/Purchase Returns' own worksheets); an invalid
 * quantity (non-numeric, <= 0, or exceeding what's remaining) on any touched row fails
 * the whole submission rather than silently dropping it. An empty unitPrice draft is
 * omitted so the server falls back to the purchase order line's own price. */
function prepareLines(
  invoiceableLines: { purchaseOrderLineId: string; remaining: number; unitPrice: { currency: string } }[],
  drafts: PurchaseInvoiceLineDrafts,
): CreatePurchaseInvoiceLineDto[] | null {
  const prepared: CreatePurchaseInvoiceLineDto[] = [];
  for (const line of invoiceableLines) {
    const draft = drafts[line.purchaseOrderLineId];
    if (!draft || draft.quantityInvoiced.trim() === '') continue;
    const quantityInvoiced = Number(draft.quantityInvoiced);
    if (!Number.isFinite(quantityInvoiced) || quantityInvoiced <= 0 || quantityInvoiced > line.remaining) {
      return null;
    }
    let unitPrice: CreatePurchaseInvoiceLineDto['unitPrice'];
    if (draft.unitPrice.trim() !== '') {
      try {
        unitPrice = { amountMinorUnits: decimalToMinorUnits(draft.unitPrice), currency: line.unitPrice.currency };
      } catch {
        return null;
      }
    }
    prepared.push({
      purchaseOrderLineId: line.purchaseOrderLineId,
      quantityInvoiced,
      unitPrice,
      notes: draft.notes.trim() === '' ? undefined : draft.notes,
    });
  }
  return prepared.length > 0 ? prepared : null;
}

export function CreatePurchaseInvoiceForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createInvoice = useCreatePurchaseInvoice();
  const { data: purchaseOrders } = usePurchaseOrders();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    PURCHASE_INVOICE_ENTITY_TYPE,
  );
  const [drafts, setDrafts] = useState<PurchaseInvoiceLineDrafts>({});
  const [linesError, setLinesError] = useState<string | null>(null);

  // Only a confirmed purchase order (any status past 'draft'/'cancelled') can be invoiced
  // — matches PurchaseInvoicesService.create()'s own check.
  const invoiceableOrders = useMemo(
    () => (purchaseOrders ?? []).filter((po) => po.status !== 'draft' && po.status !== 'cancelled'),
    [purchaseOrders],
  );

  const formSchema = useMemo(() => {
    const staticSchema = createPurchaseInvoiceSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      purchaseOrderId: invoiceableOrders[0]?.id ?? '',
      supplierInvoiceNumber: '',
      invoiceDate: '',
      dueDate: '',
      notes: '',
      customFields: {},
    },
  });

  const selectedPurchaseOrderId = form.watch('purchaseOrderId');
  const { lines: invoiceableLines, isLoading: invoiceableLoading } =
    usePurchaseOrderInvoiceable(selectedPurchaseOrderId);

  // The invoicing worksheet's rows depend entirely on which PO is selected — reset the
  // drafts whenever that changes, same as the receiving/returnable worksheets.
  useEffect(() => {
    setDrafts(createEmptyPurchaseInvoiceDrafts(invoiceableLines));
  }, [selectedPurchaseOrderId, invoiceableLines.length]);

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const preparedLines = prepareLines(invoiceableLines, drafts);
    if (!preparedLines) {
      setLinesError(t('purchases.purchaseInvoices.linesError'));
      return;
    }
    try {
      await createInvoice.mutateAsync({
        ...headerValues,
        supplierInvoiceNumber: headerValues.supplierInvoiceNumber || undefined,
        invoiceDate: headerValues.invoiceDate || undefined,
        dueDate: headerValues.dueDate || undefined,
        lines: preparedLines,
      });
      toast.success(t('purchases.purchaseInvoices.createSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.purchaseInvoices.createError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (invoiceableOrders.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('purchases.purchaseInvoices.noInvoiceableOrders')}</p>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="purchaseOrderId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.purchaseInvoices.purchaseOrder')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {invoiceableOrders.map((po) => (
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
          name="supplierInvoiceNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.purchaseInvoices.supplierInvoiceNumber')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="invoiceDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.purchaseInvoices.invoiceDate')}</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.purchaseInvoices.dueDate')}</FormLabel>
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
              <FormLabel>{t('purchases.purchaseInvoices.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.purchaseInvoices.lines')}</p>
        {invoiceableLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <PurchaseInvoiceLineItemsEditor invoiceableLines={invoiceableLines} drafts={drafts} onChange={setDrafts} />
        )}
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('purchases.purchaseInvoices.customFields')}</p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={createInvoice.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
