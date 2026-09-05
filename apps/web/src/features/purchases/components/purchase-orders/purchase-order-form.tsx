import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  type CreatePurchaseOrderLineDto,
  type PurchaseOrderWithLinesDto,
  type UpdatePurchaseOrderDto,
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
import { useSuppliers } from '../../api/suppliers/queries';
import { useSupplierQuotation } from '../../api/supplier-quotations/queries';
import { useCreatePurchaseOrder, useUpdatePurchaseOrder } from '../../api/purchase-orders/queries';
import { useEligibleQuotations } from '../../hooks/purchase-orders/use-eligible-quotations';
import { useVariantIndex } from '../../hooks/purchase-orders/use-variant-index';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits, formatMoney, minorUnitsToDecimalString } from '../../../../lib/money';
import {
  createEmptyPurchaseOrderLine,
  PurchaseOrderLineItemsEditor,
  type PurchaseOrderLineDraft,
} from './purchase-order-line-items-editor';

const PURCHASE_ORDER_ENTITY_TYPE = 'purchase_order';

function prepareLines(lines: PurchaseOrderLineDraft[], currency: string): CreatePurchaseOrderLineDto[] | null {
  if (lines.length === 0) return null;
  const prepared: CreatePurchaseOrderLineDto[] = [];
  for (const line of lines) {
    const quantity = Number(line.quantity);
    if (!line.productVariantId || !Number.isFinite(quantity) || quantity <= 0) return null;
    let amountMinorUnits: string;
    try {
      amountMinorUnits = decimalToMinorUnits(line.unitPrice);
    } catch {
      return null;
    }
    prepared.push({
      productVariantId: line.productVariantId,
      quantity,
      unitPrice: { amountMinorUnits, currency },
      notes: line.notes.trim() === '' ? undefined : line.notes,
    });
  }
  return prepared;
}

/**
 * "From quotation" create path — mirrors the backend's resolveSupplierAndLines():
 * sourceQuotationId alone determines the supplier and lines (copied verbatim from the
 * selected quotation), so this form only collects header fields plus a read-only lines
 * preview. Only 'selected' quotations without an existing PO are offered
 * (useEligibleQuotations — see that hook for why).
 */
type FromQuotationHeaderValues = {
  sourceQuotationId: string;
  expectedDeliveryDate?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
};

export function CreatePurchaseOrderFromQuotationForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createOrder = useCreatePurchaseOrder();
  const { eligibleQuotations, isLoading: eligibleLoading } = useEligibleQuotations();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(PURCHASE_ORDER_ENTITY_TYPE);
  const variantIndex = useVariantIndex();

  const formSchema = useMemo(() => {
    const staticSchema = createPurchaseOrderSchema
      .pick({ expectedDeliveryDate: true, notes: true })
      .extend({ sourceQuotationId: z.string().uuid() });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<FromQuotationHeaderValues>({
    resolver: zodResolver(formSchema as z.ZodType<FromQuotationHeaderValues>),
    defaultValues: {
      sourceQuotationId: eligibleQuotations[0]?.quotation.id ?? '',
      expectedDeliveryDate: '',
      notes: '',
      customFields: {},
    },
  });

  const selectedQuotationId = form.watch('sourceQuotationId');
  const { data: quotationDetails, isLoading: quotationLoading } = useSupplierQuotation(selectedQuotationId);

  async function onSubmit(values: FromQuotationHeaderValues) {
    try {
      await createOrder.mutateAsync({
        sourceQuotationId: values.sourceQuotationId,
        expectedDeliveryDate: values.expectedDeliveryDate || undefined,
        notes: values.notes,
        customFields: values.customFields,
      });
      toast.success(t('purchases.purchaseOrders.createSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.purchaseOrders.createError'));
    }
  }

  if (definitionsLoading || eligibleLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (eligibleQuotations.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('purchases.purchaseOrders.noEligibleQuotations')}</p>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="sourceQuotationId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.purchaseOrders.sourceQuotation')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {eligibleQuotations.map(({ quotation, rfqNumber, supplierName }) => (
                    <SelectItem key={quotation.id} value={quotation.id}>
                      {rfqNumber} — {supplierName}
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
          name="expectedDeliveryDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.purchaseOrders.expectedDeliveryDate')}</FormLabel>
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
              <FormLabel>{t('purchases.purchaseOrders.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.purchaseOrders.linesPreview')}</p>
        {quotationLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('purchases.purchaseOrders.lineProduct')}</TableHead>
                  <TableHead className="w-28">{t('purchases.purchaseOrders.lineQuantity')}</TableHead>
                  <TableHead className="w-36">{t('purchases.purchaseOrders.lineUnitPriceHeader')}</TableHead>
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
            <p className="text-sm font-medium text-muted-foreground">{t('purchases.purchaseOrders.customFields')}</p>
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
 * "Manual" create path — supplierId + lines given directly (no RFQ/quotation
 * involved). All lines take the selected supplier's own defaultCurrency, which
 * satisfies the backend's assertSingleCurrency() by construction (same approach
 * already used for Supplier Quotations, except there it's a UI simplification —
 * here it's a real constraint the backend enforces).
 */
type ManualHeaderValues = {
  supplierId: string;
  expectedDeliveryDate?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
};

export function CreatePurchaseOrderManualForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createOrder = useCreatePurchaseOrder();
  const { data: suppliers } = useSuppliers();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(PURCHASE_ORDER_ENTITY_TYPE);
  const [lines, setLines] = useState<PurchaseOrderLineDraft[]>(() => [createEmptyPurchaseOrderLine()]);
  const [linesError, setLinesError] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = createPurchaseOrderSchema
      .pick({ expectedDeliveryDate: true, notes: true })
      .extend({ supplierId: z.string().uuid() });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<ManualHeaderValues>({
    resolver: zodResolver(formSchema as z.ZodType<ManualHeaderValues>),
    defaultValues: {
      supplierId: suppliers?.[0]?.id ?? '',
      expectedDeliveryDate: '',
      notes: '',
      customFields: {},
    },
  });

  const selectedSupplierId = form.watch('supplierId');
  const currency = suppliers?.find((s) => s.id === selectedSupplierId)?.defaultCurrency ?? 'SAR';

  async function onSubmit(headerValues: ManualHeaderValues) {
    setLinesError(null);
    const preparedLines = prepareLines(lines, currency);
    if (!preparedLines) {
      setLinesError(t('purchases.purchaseOrders.linesError'));
      return;
    }
    try {
      await createOrder.mutateAsync({
        supplierId: headerValues.supplierId,
        expectedDeliveryDate: headerValues.expectedDeliveryDate || undefined,
        notes: headerValues.notes,
        customFields: headerValues.customFields,
        lines: preparedLines,
      });
      toast.success(t('purchases.purchaseOrders.createSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.purchaseOrders.createError'));
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
          name="supplierId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.purchaseOrders.supplier')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(suppliers ?? []).map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
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
          name="expectedDeliveryDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.purchaseOrders.expectedDeliveryDate')}</FormLabel>
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
              <FormLabel>{t('purchases.purchaseOrders.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.purchaseOrders.lines')}</p>
        <PurchaseOrderLineItemsEditor lines={lines} onChange={setLines} currency={currency} />
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('purchases.purchaseOrders.customFields')}</p>
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

/** One Create dialog, two tabs — matches the backend's two mutually-exclusive
 * creation paths (resolveSupplierAndLines() in PurchaseOrdersService.create()). */
export function CreatePurchaseOrderTabs({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <Tabs defaultValue="fromQuotation" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="fromQuotation">{t('purchases.purchaseOrders.fromQuotationTab')}</TabsTrigger>
        <TabsTrigger value="manual">{t('purchases.purchaseOrders.manualTab')}</TabsTrigger>
      </TabsList>
      <TabsContent value="fromQuotation" className="pt-4">
        <CreatePurchaseOrderFromQuotationForm onDone={onDone} />
      </TabsContent>
      <TabsContent value="manual" className="pt-4">
        <CreatePurchaseOrderManualForm onDone={onDone} />
      </TabsContent>
    </Tabs>
  );
}

/** supplierId/sourceQuotationId are fixed at creation — not part of updatePurchaseOrderSchema —
 * so editing only ever touches header fields (expectedDeliveryDate/notes/customFields) and lines. */
export function EditPurchaseOrderForm({
  order,
  onDone,
}: {
  order: PurchaseOrderWithLinesDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const updateOrder = useUpdatePurchaseOrder();
  const { data: suppliers } = useSuppliers();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(PURCHASE_ORDER_ENTITY_TYPE);
  const [lines, setLines] = useState<PurchaseOrderLineDraft[]>(() =>
    order.lines.length > 0
      ? order.lines.map((line) => ({
          key: line.id,
          productVariantId: line.productVariantId,
          quantity: String(line.quantity),
          unitPrice: minorUnitsToDecimalString(line.unitPrice.amountMinorUnits),
          notes: line.notes ?? '',
        }))
      : [createEmptyPurchaseOrderLine()],
  );
  const [linesError, setLinesError] = useState<string | null>(null);

  const currency =
    order.lines[0]?.unitPrice.currency ?? suppliers?.find((s) => s.id === order.supplierId)?.defaultCurrency ?? 'SAR';

  const formSchema = useMemo(() => {
    const staticSchema = updatePurchaseOrderSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions).partial() });
  }, [definitions]);

  const form = useForm<Omit<UpdatePurchaseOrderDto, 'lines'>>({
    resolver: zodResolver(formSchema as z.ZodType<Omit<UpdatePurchaseOrderDto, 'lines'>>),
    defaultValues: {
      expectedDeliveryDate: order.expectedDeliveryDate ?? '',
      notes: order.notes ?? '',
      customFields: order.customFields ?? {},
    },
  });

  async function onSubmit(headerValues: Omit<UpdatePurchaseOrderDto, 'lines'>) {
    setLinesError(null);
    const preparedLines = prepareLines(lines, currency);
    if (!preparedLines) {
      setLinesError(t('purchases.purchaseOrders.linesError'));
      return;
    }
    try {
      await updateOrder.mutateAsync({
        id: order.id,
        input: {
          ...headerValues,
          expectedDeliveryDate: headerValues.expectedDeliveryDate || undefined,
          lines: preparedLines,
        },
      });
      toast.success(t('purchases.purchaseOrders.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.purchaseOrders.updateError'));
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
          name="expectedDeliveryDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.purchaseOrders.expectedDeliveryDate')}</FormLabel>
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
              <FormLabel>{t('purchases.purchaseOrders.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.purchaseOrders.lines')}</p>
        <PurchaseOrderLineItemsEditor lines={lines} onChange={setLines} currency={currency} />
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('purchases.purchaseOrders.customFields')}</p>
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
