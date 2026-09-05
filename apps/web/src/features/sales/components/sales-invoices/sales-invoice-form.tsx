import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createSalesInvoiceSchema,
  type CreateSalesInvoiceDto,
  type CreateSalesInvoiceLineDto,
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
import { useSalesOrders } from '../../api/sales-orders/queries';
import { useCreateSalesInvoice } from '../../api/sales-invoices/queries';
import { useSalesOrderInvoiceable } from '../../hooks/sales-invoices/use-sales-order-invoiceable';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits } from '../../../../lib/money';
import {
  createEmptySalesInvoiceDrafts,
  SalesInvoiceLineItemsEditor,
  type SalesInvoiceLineDrafts,
} from './sales-invoice-line-items-editor';

const SALES_INVOICE_ENTITY_TYPE = 'sales_invoice';

/** Only rows with a positive quantityInvoiced are included (a partial invoice against a
 * sales order is normal); an invalid quantity (non-numeric, <= 0, or exceeding what's
 * remaining) on any touched row fails the whole submission rather than silently
 * dropping it. An empty unitPrice draft is omitted so the server falls back to the
 * sales order line's own price. */
function prepareLines(
  invoiceableLines: { salesOrderLineId: string; remaining: number; unitPrice: { currency: string } }[],
  drafts: SalesInvoiceLineDrafts,
): CreateSalesInvoiceLineDto[] | null {
  const prepared: CreateSalesInvoiceLineDto[] = [];
  for (const line of invoiceableLines) {
    const draft = drafts[line.salesOrderLineId];
    if (!draft || draft.quantityInvoiced.trim() === '') continue;
    const quantityInvoiced = Number(draft.quantityInvoiced);
    if (!Number.isFinite(quantityInvoiced) || quantityInvoiced <= 0 || quantityInvoiced > line.remaining) {
      return null;
    }
    let unitPrice: CreateSalesInvoiceLineDto['unitPrice'];
    if (draft.unitPrice.trim() !== '') {
      try {
        unitPrice = { amountMinorUnits: decimalToMinorUnits(draft.unitPrice), currency: line.unitPrice.currency };
      } catch {
        return null;
      }
    }
    prepared.push({
      salesOrderLineId: line.salesOrderLineId,
      quantityInvoiced,
      unitPrice,
      notes: draft.notes.trim() === '' ? undefined : draft.notes,
    });
  }
  return prepared.length > 0 ? prepared : null;
}

type HeaderFormValues = Omit<CreateSalesInvoiceDto, 'lines'>;

export function CreateSalesInvoiceForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createInvoice = useCreateSalesInvoice();
  const { data: salesOrders } = useSalesOrders();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    SALES_INVOICE_ENTITY_TYPE,
  );
  const [drafts, setDrafts] = useState<SalesInvoiceLineDrafts>({});
  const [linesError, setLinesError] = useState<string | null>(null);

  // Only a confirmed sales order (any status past 'draft'/'cancelled') can be invoiced
  // — matches SalesInvoicesService.create()'s own check.
  const invoiceableOrders = useMemo(
    () => (salesOrders ?? []).filter((so) => so.status !== 'draft' && so.status !== 'cancelled'),
    [salesOrders],
  );

  const formSchema = useMemo(() => {
    const staticSchema = createSalesInvoiceSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      salesOrderId: invoiceableOrders[0]?.id ?? '',
      invoiceDate: '',
      dueDate: '',
      notes: '',
      customFields: {},
    },
  });

  const selectedSalesOrderId = form.watch('salesOrderId');
  const { lines: invoiceableLines, isLoading: invoiceableLoading } = useSalesOrderInvoiceable(selectedSalesOrderId);

  // The invoicing worksheet's rows depend entirely on which sales order is selected —
  // reset the drafts whenever that changes, same as the delivering/returnable worksheets.
  useEffect(() => {
    setDrafts(createEmptySalesInvoiceDrafts(invoiceableLines));
  }, [selectedSalesOrderId, invoiceableLines.length]);

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const preparedLines = prepareLines(invoiceableLines, drafts);
    if (!preparedLines) {
      setLinesError(t('sales.salesInvoices.linesError'));
      return;
    }
    try {
      await createInvoice.mutateAsync({
        ...headerValues,
        invoiceDate: headerValues.invoiceDate || undefined,
        dueDate: headerValues.dueDate || undefined,
        lines: preparedLines,
      });
      toast.success(t('sales.salesInvoices.createSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.salesInvoices.createError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (invoiceableOrders.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('sales.salesInvoices.noInvoiceableOrders')}</p>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="salesOrderId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.salesInvoices.salesOrder')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {invoiceableOrders.map((so) => (
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
          name="invoiceDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.salesInvoices.invoiceDate')}</FormLabel>
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
              <FormLabel>{t('sales.salesInvoices.dueDate')}</FormLabel>
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
              <FormLabel>{t('sales.salesInvoices.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('sales.salesInvoices.lines')}</p>
        {invoiceableLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <SalesInvoiceLineItemsEditor invoiceableLines={invoiceableLines} drafts={drafts} onChange={setDrafts} />
        )}
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('sales.salesInvoices.customFields')}</p>
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
