import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createSalesOrderSchema,
  updateSalesOrderSchema,
  type CreateSalesOrderLineDto,
  type SalesOrderWithLinesDto,
  type UpdateSalesOrderDto,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useCustomFieldDefinitions } from '../../../settings/queries';
import { useCustomers } from '../../api/customers/queries';
import { useQuotation } from '../../api/quotations/queries';
import { useCreateSalesOrder, useUpdateSalesOrder } from '../../api/sales-orders/queries';
import { useEligibleQuotations } from '../../hooks/sales-orders/use-eligible-quotations';
import { useVariantIndex } from '../../hooks/sales-orders/use-variant-index';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits, formatMoney, minorUnitsToDecimalString } from '../../../../lib/money';
import {
  createEmptySalesOrderLine,
  SalesOrderLineItemsEditor,
  type SalesOrderLineDraft,
} from './sales-order-line-items-editor';
import { createEmptyDiscountDraft, DiscountFields, discountDraftFromDto, resolveDiscountInput, type DiscountDraft } from '../../lib/discount-fields';

const SALES_ORDER_ENTITY_TYPE = 'sales_order';

function prepareLines(lines: SalesOrderLineDraft[], currency: string): CreateSalesOrderLineDto[] | null {
  if (lines.length === 0) return null;
  const prepared: CreateSalesOrderLineDto[] = [];
  for (const line of lines) {
    const quantity = Number(line.quantity);
    if (!line.productVariantId || !Number.isFinite(quantity) || quantity <= 0) return null;
    let amountMinorUnits: string;
    try {
      amountMinorUnits = decimalToMinorUnits(line.unitPrice);
    } catch {
      return null;
    }
    const resolvedDiscount = resolveDiscountInput(line.discount, currency);
    if (resolvedDiscount === 'invalid') return null;
    prepared.push({
      productVariantId: line.productVariantId,
      quantity,
      unitPrice: { amountMinorUnits, currency },
      notes: line.notes.trim() === '' ? undefined : line.notes,
      ...resolvedDiscount,
    });
  }
  return prepared;
}

/**
 * "From quotation" create path — mirrors the backend's resolveCustomerAndLines():
 * sourceQuotationId alone determines the customer and lines (copied verbatim from the
 * accepted quotation), so this form only collects header fields plus a read-only lines
 * preview. Only 'accepted' quotations without an existing sales order are offered
 * (useEligibleQuotations — see that hook for why).
 */
type FromQuotationHeaderValues = {
  sourceQuotationId: string;
  notes?: string;
  customFields?: Record<string, unknown>;
};

export function CreateSalesOrderFromQuotationForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createOrder = useCreateSalesOrder();
  const { eligibleQuotations, isLoading: eligibleLoading } = useEligibleQuotations();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(SALES_ORDER_ENTITY_TYPE);
  const variantIndex = useVariantIndex();

  const formSchema = useMemo(() => {
    const staticSchema = createSalesOrderSchema
      .pick({ notes: true })
      .extend({ sourceQuotationId: z.string().uuid() });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<FromQuotationHeaderValues>({
    resolver: zodResolver(formSchema as z.ZodType<FromQuotationHeaderValues>),
    defaultValues: {
      sourceQuotationId: eligibleQuotations[0]?.quotation.id ?? '',
      notes: '',
      customFields: {},
    },
  });

  const selectedQuotationId = form.watch('sourceQuotationId');
  const { data: quotationDetails, isLoading: quotationLoading } = useQuotation(selectedQuotationId);
  const currency = quotationDetails?.lines[0]?.unitPrice.currency ?? 'SAR';
  const [discountDraft, setDiscountDraft] = useState<DiscountDraft>(() => createEmptyDiscountDraft());
  const [discountError, setDiscountError] = useState<string | null>(null);

  async function onSubmit(values: FromQuotationHeaderValues) {
    setDiscountError(null);
    const resolvedDiscount = resolveDiscountInput(discountDraft, currency);
    if (resolvedDiscount === 'invalid') {
      setDiscountError(t('sales.salesOrders.discountError'));
      return;
    }
    try {
      await createOrder.mutateAsync({
        sourceQuotationId: values.sourceQuotationId,
        notes: values.notes,
        customFields: values.customFields,
        ...resolvedDiscount,
      });
      toast.success(t('sales.salesOrders.createSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.salesOrders.createError'));
    }
  }

  if (definitionsLoading || eligibleLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (eligibleQuotations.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('sales.salesOrders.noEligibleQuotations')}</p>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="sourceQuotationId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.salesOrders.sourceQuotation')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {eligibleQuotations.map(({ quotation, customerName }) => (
                    <SelectItem key={quotation.id} value={quotation.id}>
                      {quotation.quotationNumber} — {customerName}
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
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.salesOrders.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('sales.salesOrders.discountSectionTitle')}</p>
        <DiscountFields value={discountDraft} onChange={setDiscountDraft} currency={currency} />
        {discountError ? <p className="text-sm text-destructive">{discountError}</p> : null}

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('sales.salesOrders.linesPreview')}</p>
        {quotationLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('sales.salesOrders.lineProduct')}</TableHead>
                  <TableHead className="w-28">{t('sales.salesOrders.lineQuantity')}</TableHead>
                  <TableHead className="w-36">{t('sales.salesOrders.lineUnitPriceHeader')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(quotationDetails?.lines ?? []).map((line) => {
                  const variant = variantIndex.get(line.productVariantId);
                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        {variant ? `${variant.productName} — ${variant.sku}` : line.productVariantId}
                      </TableCell>
                      <TableCell>{line.quantity}</TableCell>
                      <TableCell>{formatMoney(line.unitPrice.amountMinorUnits, line.unitPrice.currency)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('sales.salesOrders.customFields')}</p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={createOrder.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

/**
 * "Manual" create path — customerId + lines given directly (no quotation involved).
 * All lines take the selected customer's own defaultCurrency, which satisfies the
 * backend's assertSingleCurrency() by construction — same approach as Quotations and
 * Purchase Orders' manual path.
 */
type ManualHeaderValues = {
  customerId: string;
  notes?: string;
  customFields?: Record<string, unknown>;
};

export function CreateSalesOrderManualForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createOrder = useCreateSalesOrder();
  const { data: customers } = useCustomers();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(SALES_ORDER_ENTITY_TYPE);
  const [lines, setLines] = useState<SalesOrderLineDraft[]>(() => [createEmptySalesOrderLine()]);
  const [linesError, setLinesError] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = createSalesOrderSchema.pick({ notes: true }).extend({ customerId: z.string().uuid() });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<ManualHeaderValues>({
    resolver: zodResolver(formSchema as z.ZodType<ManualHeaderValues>),
    defaultValues: {
      customerId: customers?.[0]?.id ?? '',
      notes: '',
      customFields: {},
    },
  });

  const selectedCustomerId = form.watch('customerId');
  const currency = customers?.find((c) => c.id === selectedCustomerId)?.defaultCurrency ?? 'SAR';
  const [discountDraft, setDiscountDraft] = useState<DiscountDraft>(() => createEmptyDiscountDraft());
  const [discountError, setDiscountError] = useState<string | null>(null);

  async function onSubmit(headerValues: ManualHeaderValues) {
    setLinesError(null);
    setDiscountError(null);
    const preparedLines = prepareLines(lines, currency);
    if (!preparedLines) {
      setLinesError(t('sales.salesOrders.linesError'));
      return;
    }
    const resolvedDiscount = resolveDiscountInput(discountDraft, currency);
    if (resolvedDiscount === 'invalid') {
      setDiscountError(t('sales.salesOrders.discountError'));
      return;
    }
    try {
      await createOrder.mutateAsync({
        customerId: headerValues.customerId,
        notes: headerValues.notes,
        customFields: headerValues.customFields,
        lines: preparedLines,
        ...resolvedDiscount,
      });
      toast.success(t('sales.salesOrders.createSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.salesOrders.createError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="customerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.salesOrders.customer')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(customers ?? []).map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
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
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.salesOrders.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('sales.salesOrders.discountSectionTitle')}</p>
        <DiscountFields value={discountDraft} onChange={setDiscountDraft} currency={currency} />
        {discountError ? <p className="text-sm text-destructive">{discountError}</p> : null}

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('sales.salesOrders.lines')}</p>
        <SalesOrderLineItemsEditor lines={lines} onChange={setLines} currency={currency} />
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('sales.salesOrders.customFields')}</p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={createOrder.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

/** One Create dialog, two tabs — matches the backend's two mutually-exclusive creation
 * paths (resolveCustomerAndLines() in SalesOrdersService.create()). */
export function CreateSalesOrderTabs({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <Tabs defaultValue="fromQuotation" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="fromQuotation">{t('sales.salesOrders.fromQuotationTab')}</TabsTrigger>
        <TabsTrigger value="manual">{t('sales.salesOrders.manualTab')}</TabsTrigger>
      </TabsList>
      <TabsContent value="fromQuotation" className="pt-4">
        <CreateSalesOrderFromQuotationForm onDone={onDone} />
      </TabsContent>
      <TabsContent value="manual" className="pt-4">
        <CreateSalesOrderManualForm onDone={onDone} />
      </TabsContent>
    </Tabs>
  );
}

/** customerId/sourceQuotationId are fixed at creation — not part of updateSalesOrderSchema
 * — so editing only ever touches header fields (notes/customFields) and lines. */
export function EditSalesOrderForm({
  order,
  onDone,
}: {
  order: SalesOrderWithLinesDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const updateOrder = useUpdateSalesOrder();
  const { data: customers } = useCustomers();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(SALES_ORDER_ENTITY_TYPE);
  const [lines, setLines] = useState<SalesOrderLineDraft[]>(() =>
    order.lines.length > 0
      ? order.lines.map((line) => ({
          key: line.id,
          productVariantId: line.productVariantId,
          quantity: String(line.quantity),
          unitPrice: minorUnitsToDecimalString(line.unitPrice.amountMinorUnits),
          notes: line.notes ?? '',
          discount: discountDraftFromDto(line),
        }))
      : [createEmptySalesOrderLine()],
  );
  const [linesError, setLinesError] = useState<string | null>(null);
  const [discountDraft, setDiscountDraft] = useState<DiscountDraft>(() => discountDraftFromDto(order));
  const [discountError, setDiscountError] = useState<string | null>(null);

  const currency =
    order.lines[0]?.unitPrice.currency ?? customers?.find((c) => c.id === order.customerId)?.defaultCurrency ?? 'SAR';

  const formSchema = useMemo(() => {
    const staticSchema = updateSalesOrderSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions).partial() });
  }, [definitions]);

  const form = useForm<Omit<UpdateSalesOrderDto, 'lines'>>({
    resolver: zodResolver(formSchema as z.ZodType<Omit<UpdateSalesOrderDto, 'lines'>>),
    defaultValues: {
      notes: order.notes ?? '',
      customFields: order.customFields ?? {},
    },
  });

  async function onSubmit(headerValues: Omit<UpdateSalesOrderDto, 'lines'>) {
    setLinesError(null);
    setDiscountError(null);
    const preparedLines = prepareLines(lines, currency);
    if (!preparedLines) {
      setLinesError(t('sales.salesOrders.linesError'));
      return;
    }
    const resolvedDiscount = resolveDiscountInput(discountDraft, currency);
    if (resolvedDiscount === 'invalid') {
      setDiscountError(t('sales.salesOrders.discountError'));
      return;
    }
    try {
      await updateOrder.mutateAsync({
        id: order.id,
        input: {
          ...headerValues,
          ...resolvedDiscount,
          lines: preparedLines,
        },
      });
      toast.success(t('sales.salesOrders.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.salesOrders.updateError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.salesOrders.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('sales.salesOrders.discountSectionTitle')}</p>
        <DiscountFields value={discountDraft} onChange={setDiscountDraft} currency={currency} />
        {discountError ? <p className="text-sm text-destructive">{discountError}</p> : null}

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('sales.salesOrders.lines')}</p>
        <SalesOrderLineItemsEditor lines={lines} onChange={setLines} currency={currency} />
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('sales.salesOrders.customFields')}</p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={updateOrder.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
