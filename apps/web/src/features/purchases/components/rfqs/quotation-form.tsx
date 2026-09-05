import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createSupplierQuotationSchema,
  updateSupplierQuotationSchema,
  type CreateSupplierQuotationDto,
  type CreateSupplierQuotationLineDto,
  type SupplierQuotationWithLinesDto,
  type UpdateSupplierQuotationDto,
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
import { useSuppliers } from '../../api/suppliers/queries';
import { useCreateSupplierQuotation, useUpdateSupplierQuotation } from '../../api/supplier-quotations/queries';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../../lib/money';
import {
  createEmptyQuotationLine,
  QuotationLineItemsEditor,
  type QuotationLineDraft,
} from './quotation-line-items-editor';

const SUPPLIER_QUOTATION_ENTITY_TYPE = 'supplier_quotation';

type HeaderFormValues = Omit<CreateSupplierQuotationDto, 'lines'>;

function prepareLines(
  lines: QuotationLineDraft[],
  currency: string,
): CreateSupplierQuotationLineDto[] | null {
  if (lines.length === 0) return null;
  const prepared: CreateSupplierQuotationLineDto[] = [];
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
 * eligibleSupplierIds: RFQ suppliers who don't already have a quotation recorded (any
 * status — the backend enforces at most one quotation per supplier per RFQ). Passed in by
 * RfqDetailsView, which already has both the RFQ's invited list and the existing
 * quotations loaded.
 */
export function CreateSupplierQuotationForm({
  rfqId,
  eligibleSupplierIds,
  onDone,
}: {
  rfqId: string;
  eligibleSupplierIds: string[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const createQuotation = useCreateSupplierQuotation();
  const { data: suppliers } = useSuppliers();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    SUPPLIER_QUOTATION_ENTITY_TYPE,
  );
  const [lines, setLines] = useState<QuotationLineDraft[]>(() => [createEmptyQuotationLine()]);
  const [linesError, setLinesError] = useState<string | null>(null);

  const eligibleSuppliers = useMemo(
    () => (suppliers ?? []).filter((s) => eligibleSupplierIds.includes(s.id)),
    [suppliers, eligibleSupplierIds],
  );

  const formSchema = useMemo(() => {
    const staticSchema = createSupplierQuotationSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      rfqId,
      supplierId: eligibleSuppliers[0]?.id ?? '',
      validUntil: '',
      notes: '',
      customFields: {},
    },
  });

  const selectedSupplierId = form.watch('supplierId');
  const currency = suppliers?.find((s) => s.id === selectedSupplierId)?.defaultCurrency ?? 'SAR';

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const preparedLines = prepareLines(lines, currency);
    if (!preparedLines) {
      setLinesError(t('purchases.rfqs.quotationLinesError'));
      return;
    }
    try {
      await createQuotation.mutateAsync({
        ...headerValues,
        validUntil: headerValues.validUntil || undefined,
        lines: preparedLines,
      });
      toast.success(t('purchases.rfqs.quotationCreateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.rfqs.quotationCreateError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (eligibleSuppliers.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('purchases.rfqs.noEligibleSuppliers')}</p>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="supplierId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.rfqs.quotationSupplier')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {eligibleSuppliers.map((supplier) => (
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
          name="validUntil"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.rfqs.validUntil')}</FormLabel>
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
              <FormLabel>{t('purchases.rfqs.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.rfqs.lines')}</p>
        <QuotationLineItemsEditor lines={lines} onChange={setLines} currency={currency} />
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('purchases.rfqs.customFields')}</p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={createQuotation.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

export function EditSupplierQuotationForm({
  quotation,
  onDone,
}: {
  quotation: SupplierQuotationWithLinesDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const updateQuotation = useUpdateSupplierQuotation();
  const { data: suppliers } = useSuppliers();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    SUPPLIER_QUOTATION_ENTITY_TYPE,
  );
  const [lines, setLines] = useState<QuotationLineDraft[]>(() =>
    quotation.lines.length > 0
      ? quotation.lines.map((line) => ({
          key: line.id,
          productVariantId: line.productVariantId,
          quantity: String(line.quantity),
          unitPrice: minorUnitsToDecimalString(line.unitPrice.amountMinorUnits),
          notes: line.notes ?? '',
        }))
      : [createEmptyQuotationLine()],
  );
  const [linesError, setLinesError] = useState<string | null>(null);

  // supplierId can't change on edit (not part of updateSupplierQuotationSchema) — the
  // currency is whatever the quotation's own lines already carry, falling back to the
  // supplier's current defaultCurrency only if this quotation somehow has no lines yet.
  const currency =
    quotation.lines[0]?.unitPrice.currency ??
    suppliers?.find((s) => s.id === quotation.supplierId)?.defaultCurrency ??
    'SAR';

  const formSchema = useMemo(() => {
    const staticSchema = updateSupplierQuotationSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions).partial() });
  }, [definitions]);

  const form = useForm<Omit<UpdateSupplierQuotationDto, 'lines'>>({
    resolver: zodResolver(formSchema as z.ZodType<Omit<UpdateSupplierQuotationDto, 'lines'>>),
    defaultValues: {
      validUntil: quotation.validUntil ?? '',
      notes: quotation.notes ?? '',
      customFields: quotation.customFields ?? {},
    },
  });

  async function onSubmit(headerValues: Omit<UpdateSupplierQuotationDto, 'lines'>) {
    setLinesError(null);
    const preparedLines = prepareLines(lines, currency);
    if (!preparedLines) {
      setLinesError(t('purchases.rfqs.quotationLinesError'));
      return;
    }
    try {
      await updateQuotation.mutateAsync({
        id: quotation.id,
        input: {
          ...headerValues,
          validUntil: headerValues.validUntil || undefined,
          lines: preparedLines,
        },
      });
      toast.success(t('purchases.rfqs.quotationUpdateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.rfqs.quotationUpdateError'));
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
          name="validUntil"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.rfqs.validUntil')}</FormLabel>
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
              <FormLabel>{t('purchases.rfqs.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.rfqs.lines')}</p>
        <QuotationLineItemsEditor lines={lines} onChange={setLines} currency={currency} />
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('purchases.rfqs.customFields')}</p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={updateQuotation.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
