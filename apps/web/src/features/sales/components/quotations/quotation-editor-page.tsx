import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createQuotationSchema, type QuotationWithLinesDto } from '@erp-platform/contracts';
import {
  Badge,
  buildCustomFieldsSchema,
  Button,
  CustomFieldsFormSection,
  EmptyState,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Label,
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';
import { FileQuestion } from 'lucide-react';

import { useBaseCurrency, useCustomFieldDefinitions } from '../../../settings/queries';
import { useCustomers } from '../../api/customers/queries';
import { useDocumentPriceList } from '../../api/price-lists/use-document-price-list';
import { useVariantLookupMap } from '../../../inventory/api/products/queries';
import { useCreateQuotation, useQuotation, useUpdateQuotation } from '../../api/quotations/queries';
import { CustomerPicker } from '../../lib/customer-picker';
import { PriceListSelect } from '../price-lists/price-list-select';
import { ApiError } from '../../../../lib/api-client';
import { minorUnitsToDecimalString } from '../../../../lib/money';
import { Amount } from '../../../../components/amount';
import { DocumentBody, DocumentHeaderBar, SectionCard, TotalsPanel } from '../../../../components/document/document-layout';
import {
  DirectLinesEditor,
  newDirectLine,
  parseDirectLines,
  previewDirectLineAmount,
  type DirectLineDraft,
} from '../../../../components/document/direct-lines-editor';
import { QUOTATIONS_PATH, quotationStatusLabelKey } from './quotation-status';

const QUOTATION_ENTITY_TYPE = 'quotation';

type HeaderFormValues = {
  customerId: string;
  validUntilDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
};

function linesFromQuotation(quotation: QuotationWithLinesDto): DirectLineDraft[] {
  if (quotation.lines.length === 0) return [newDirectLine()];
  return quotation.lines.map((line) => ({
    ...newDirectLine(),
    productVariantId: line.productVariantId,
    unitOfMeasureId: line.unitOfMeasureId ?? null,
    quantity: String(line.quantity),
    unitPrice: minorUnitsToDecimalString(line.unitPrice.amountMinorUnits),
    notes: line.notes ?? '',
  }));
}

/** /sales/quotations/new and /:id/edit (drafts only) — a quotation as a full page. */
export function QuotationEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: quotation, isLoading, isError } = useQuotation(id);
  const { isLoading: definitionsLoading } = useCustomFieldDefinitions(QUOTATION_ENTITY_TYPE);
  if ((id && isLoading) || definitionsLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (id && (isError || !quotation || quotation.status !== 'draft')) {
    return <EmptyState icon={<FileQuestion />} title={t('documents.notFound')} />;
  }
  return <QuotationEditor quotation={id ? quotation : undefined} />;
}

function QuotationEditor({ quotation }: { quotation: QuotationWithLinesDto | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createQuotation = useCreateQuotation();
  const updateQuotation = useUpdateQuotation();
  const { data: customers } = useCustomers();
  const { data: definitions } = useCustomFieldDefinitions(QUOTATION_ENTITY_TYPE);
  const baseCurrency = useBaseCurrency();
  const [lines, setLines] = useState<DirectLineDraft[]>(() =>
    quotation ? linesFromQuotation(quotation) : [newDirectLine()],
  );
  const [linesError, setLinesError] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = createQuotationSchema
      .pick({ validUntilDate: true, notes: true })
      .extend({ customerId: z.string().uuid({ message: t('sales.quotations.customerRequired') }) });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions, t]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      customerId: quotation?.customerId ?? new URLSearchParams(window.location.search).get('customerId') ?? '',
      validUntilDate: quotation?.validUntilDate ?? '',
      notes: quotation?.notes ?? '',
      customFields: quotation?.customFields ?? {},
    },
  });

  const customerId = form.watch('customerId');
  const customer = customers?.find((c) => c.id === customerId);
  // Every line takes one currency (the backend's assertSingleCurrency): the saved
  // lines' currency when editing, otherwise the customer's.
  const currency = quotation?.lines[0]?.unitPrice.currency || customer?.defaultCurrency || baseCurrency;
  const variants = useVariantLookupMap();
  const { priceListId, setPriceListId, pricer } = useDocumentPriceList<DirectLineDraft>({
    partyPriceListId: customer?.priceListId,
    partyId: customerId,
    currency,
    variants,
    setLines,
  });

  const amounts = lines.map(previewDirectLineAmount);
  const filledCount = amounts.filter((a) => a !== null).length;
  const total = amounts.reduce((sum, a) => sum + (a ? BigInt(a) : 0n), 0n).toString();

  const saving = createQuotation.isPending || updateQuotation.isPending;

  async function onSubmit(values: HeaderFormValues) {
    setLinesError(null);
    const parsed = parseDirectLines(lines, currency);
    if (!parsed) {
      setLinesError(t('sales.quotations.linesError'));
      return;
    }
    const header = {
      validUntilDate: values.validUntilDate || null,
      notes: values.notes || null,
      customFields: values.customFields,
    };
    try {
      const saved = quotation
        ? await updateQuotation.mutateAsync({ id: quotation.id, input: { ...header, lines: parsed } })
        : await createQuotation.mutateAsync({ ...header, customerId: values.customerId, lines: parsed });
      toast.success(t(quotation ? 'sales.quotations.updateSuccess' : 'sales.quotations.createSuccess'));
      navigate(`${QUOTATIONS_PATH}/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : t(quotation ? 'sales.quotations.updateError' : 'sales.quotations.createError'),
      );
    }
  }

  // Ctrl/⌘+S saves.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!saving) void form.handleSubmit(onSubmit)();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DocumentHeaderBar
          backTo={quotation ? `${QUOTATIONS_PATH}/${quotation.id}` : QUOTATIONS_PATH}
          backLabel={t('documents.back')}
          eyebrow={t('sales.tabs.quotations')}
          title={
            quotation
              ? t('sales.quotations.editTitle', { number: quotation.quotationNumber })
              : t('sales.quotations.newQuotation')
          }
          status={<Badge variant="neutral">{t(quotationStatusLabelKey('draft'))}</Badge>}
          actions={
            <>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={saving} title="Ctrl+S">
                {t('common.save')}
              </Button>
            </>
          }
        />
        <DocumentBody
          main={
            <>
              <SectionCard title={t('documents.info')}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2 lg:col-span-1">
                        <FormLabel>{t('sales.quotations.customer')}</FormLabel>
                        <FormControl>
                          <CustomerPicker
                            value={field.value}
                            onChange={(id) => field.onChange(id)}
                            disabled={Boolean(quotation)}
                          />
                        </FormControl>
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
                  <div className="grid content-start gap-2">
                    <Label>{t('priceLists.field')}</Label>
                    <PriceListSelect value={priceListId} onChange={setPriceListId} currency={currency} />
                  </div>
                </div>
              </SectionCard>

              <SectionCard title={t('documents.lines')} flush>
                <div className="overflow-x-auto">
                  <DirectLinesEditor
                    lines={lines}
                    onChange={setLines}
                    priceKind="sale"
                    currency={currency}
                    pricer={pricer}
                  />
                </div>
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
                ...(customer ? [{ label: t('sales.quotations.customer'), value: customer.name }] : []),
                { label: t('documents.linesCount'), value: filledCount },
              ]}
              totalLabel={t('documents.estimatedTotal')}
              totalValue={<Amount value={total} hideCurrency />}
              currency={currency}
              footer={
                <>
                  <Button type="submit" size="lg" disabled={saving}>
                    {t('common.save')}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">{t('documents.estimateNote')}</p>
                </>
              }
            />
          }
        />
      </form>
    </Form>
  );
}
