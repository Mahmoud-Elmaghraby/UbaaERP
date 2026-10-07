import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createQuotationSchema,
  updateQuotationSchema,
  type CreateQuotationLineDto,
  type QuotationWithLinesDto,
  type UpdateQuotationDto,
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
import { useCustomers } from '../../api/customers/queries';
import { useCreateQuotation, useUpdateQuotation } from '../../api/quotations/queries';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../../lib/money';
import {
  createEmptyQuotationLine,
  QuotationLineItemsEditor,
  type QuotationLineDraft,
} from './quotation-line-items-editor';

const QUOTATION_ENTITY_TYPE = 'quotation';

function prepareLines(lines: QuotationLineDraft[], currency: string): CreateQuotationLineDto[] | null {
  if (lines.length === 0) return null;
  const prepared: CreateQuotationLineDto[] = [];
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
      unitOfMeasureId: line.unitOfMeasureId,
      quantity,
      unitPrice: { amountMinorUnits, currency },
      notes: line.notes.trim() === '' ? undefined : line.notes,
    });
  }
  return prepared;
}

/**
 * Quotations have a single, direct creation path (customerId + lines) — unlike
 * Purchase Orders/Sales Orders there's no "from a prior document" alternative, since a
 * quotation is the first document in the Sales chain. All lines take the selected
 * customer's own defaultCurrency, which satisfies the backend's assertSingleCurrency()
 * by construction, same UI simplification used throughout Purchases.
 */
type HeaderFormValues = {
  customerId: string;
  validUntilDate?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
};

export function CreateQuotationForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createQuotation = useCreateQuotation();
  const { data: customers } = useCustomers();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(QUOTATION_ENTITY_TYPE);
  const [lines, setLines] = useState<QuotationLineDraft[]>(() => [createEmptyQuotationLine()]);
  const [linesError, setLinesError] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = createQuotationSchema
      .pick({ validUntilDate: true, notes: true })
      .extend({ customerId: z.string().uuid() });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      customerId: customers?.[0]?.id ?? '',
      validUntilDate: '',
      notes: '',
      customFields: {},
    },
  });

  const selectedCustomerId = form.watch('customerId');
  const currency = customers?.find((c) => c.id === selectedCustomerId)?.defaultCurrency ?? 'SAR';

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const preparedLines = prepareLines(lines, currency);
    if (!preparedLines) {
      setLinesError(t('sales.quotations.linesError'));
      return;
    }
    try {
      await createQuotation.mutateAsync({
        customerId: headerValues.customerId,
        validUntilDate: headerValues.validUntilDate || undefined,
        notes: headerValues.notes,
        customFields: headerValues.customFields,
        lines: preparedLines,
      });
      toast.success(t('sales.quotations.createSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.quotations.createError'));
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
              <FormLabel>{t('sales.quotations.customer')}</FormLabel>
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
          name="validUntilDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.quotations.validUntilDate')}</FormLabel>
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
              <FormLabel>{t('sales.quotations.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('sales.quotations.lines')}</p>
        <QuotationLineItemsEditor lines={lines} onChange={setLines} currency={currency} />
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('sales.quotations.customFields')}</p>
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

/** customerId is fixed at creation — not part of updateQuotationSchema — so editing only
 * ever touches header fields (validUntilDate/notes/customFields) and lines. Only offered
 * while status === 'draft' (QuotationsService.update() rejects otherwise), matching
 * Purchase Orders' own "only draft is editable" precedent. */
export function EditQuotationForm({
  quotation,
  onDone,
}: {
  quotation: QuotationWithLinesDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const updateQuotation = useUpdateQuotation();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(QUOTATION_ENTITY_TYPE);
  const [lines, setLines] = useState<QuotationLineDraft[]>(() =>
    quotation.lines.length > 0
      ? quotation.lines.map((line) => ({
          key: line.id,
          productVariantId: line.productVariantId,
          unitOfMeasureId: line.unitOfMeasureId ?? null,
          quantity: String(line.quantity),
          unitPrice: minorUnitsToDecimalString(line.unitPrice.amountMinorUnits),
          notes: line.notes ?? '',
        }))
      : [createEmptyQuotationLine()],
  );
  const [linesError, setLinesError] = useState<string | null>(null);

  const currency = quotation.lines[0]?.unitPrice.currency ?? 'SAR';

  const formSchema = useMemo(() => {
    const staticSchema = updateQuotationSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions).partial() });
  }, [definitions]);

  const form = useForm<Omit<UpdateQuotationDto, 'lines'>>({
    resolver: zodResolver(formSchema as z.ZodType<Omit<UpdateQuotationDto, 'lines'>>),
    defaultValues: {
      validUntilDate: quotation.validUntilDate ?? '',
      notes: quotation.notes ?? '',
      customFields: quotation.customFields ?? {},
    },
  });

  async function onSubmit(headerValues: Omit<UpdateQuotationDto, 'lines'>) {
    setLinesError(null);
    const preparedLines = prepareLines(lines, currency);
    if (!preparedLines) {
      setLinesError(t('sales.quotations.linesError'));
      return;
    }
    try {
      await updateQuotation.mutateAsync({
        id: quotation.id,
        input: {
          ...headerValues,
          validUntilDate: headerValues.validUntilDate || undefined,
          lines: preparedLines,
        },
      });
      toast.success(t('sales.quotations.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.quotations.updateError'));
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
          name="validUntilDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.quotations.validUntilDate')}</FormLabel>
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
              <FormLabel>{t('sales.quotations.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('sales.quotations.lines')}</p>
        <QuotationLineItemsEditor lines={lines} onChange={setLines} currency={currency} />
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('sales.quotations.customFields')}</p>
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
