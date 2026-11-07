import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createRfqSchema, type CreateRfqDto, type CreateRfqLineDto, type RfqWithDetailsDto } from '@erp-platform/contracts';
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
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';
import { FileQuestion } from 'lucide-react';

import { useCustomFieldDefinitions } from '../../../settings/queries';
import { useCreateRfq, useRfq, useUpdateRfq } from '../../api/rfqs/queries';
import { usePurchaseRequisition } from '../../api/purchase-requisitions/queries';
import { ApiError } from '../../../../lib/api-client';
import { toWesternDigits } from '../../../../lib/search-normalize';
import { useSaveShortcut } from '../../../../lib/use-save-shortcut';
import { DocumentBody, DocumentHeaderBar, SectionCard, TotalsPanel } from '../../../../components/document/document-layout';
import { SourceRequisitionField, SupplierChecklist } from './rfq-form-fields';
import { createEmptyRfqLine, RfqLineItemsEditor, type RfqLineDraft } from './rfq-line-items-editor';
import { RFQS_PATH, rfqStatusLabelKey } from './rfq-status';

const RFQ_ENTITY_TYPE = 'rfq';

type HeaderFormValues = Omit<CreateRfqDto, 'lines' | 'supplierIds'>;

function prepareLines(lines: RfqLineDraft[]): CreateRfqLineDto[] | null {
  if (lines.length === 0) return null;
  const prepared: CreateRfqLineDto[] = [];
  for (const line of lines) {
    const quantity = Number(toWesternDigits(line.quantity));
    if (!line.productVariantId || !Number.isFinite(quantity) || quantity <= 0) return null;
    prepared.push({ productVariantId: line.productVariantId, quantity, notes: line.notes.trim() === '' ? undefined : line.notes });
  }
  return prepared;
}

/** /purchases/rfqs/new[?requisitionId=] and /:id/edit (drafts only). Picking an approved
 * requisition copies its lines (they stay editable). */
export function RfqEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: rfq, isLoading, isError } = useRfq(id);
  const { isLoading: definitionsLoading } = useCustomFieldDefinitions(RFQ_ENTITY_TYPE);
  if ((id && isLoading) || definitionsLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (id && (isError || !rfq || rfq.status !== 'draft')) {
    return <EmptyState icon={<FileQuestion />} title={t('documents.notFound')} />;
  }
  return <RfqEditor rfq={id ? rfq : undefined} />;
}

function RfqEditor({ rfq }: { rfq: RfqWithDetailsDto | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const createRfq = useCreateRfq();
  const updateRfq = useUpdateRfq();
  const { data: definitions } = useCustomFieldDefinitions(RFQ_ENTITY_TYPE);
  const [lines, setLines] = useState<RfqLineDraft[]>(() =>
    rfq && rfq.lines.length > 0
      ? rfq.lines.map((line) => ({ key: line.id, productVariantId: line.productVariantId, quantity: String(line.quantity), notes: line.notes ?? '' }))
      : [createEmptyRfqLine()],
  );
  const [supplierIds, setSupplierIds] = useState<string[]>(rfq?.supplierIds ?? []);
  const [linesError, setLinesError] = useState<string | null>(null);
  const [suppliersError, setSuppliersError] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = createRfqSchema.omit({ lines: true, supplierIds: true, customFields: true });
    if (!definitions) return staticSchema;
    const customFields = buildCustomFieldsSchema(definitions);
    return staticSchema.extend({ customFields: rfq ? customFields.partial() : customFields });
  }, [definitions, rfq]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      sourceRequisitionId: rfq?.sourceRequisitionId ?? params.get('requisitionId') ?? null,
      notes: rfq?.notes ?? '',
      customFields: rfq?.customFields ?? {},
    },
  });

  // A new RFQ copies the chosen requisition's lines once they load.
  const sourceRequisitionId = form.watch('sourceRequisitionId');
  const { data: requisition } = usePurchaseRequisition(!rfq ? sourceRequisitionId : null);
  const copiedFrom = useRef<string | null>(null);
  useEffect(() => {
    if (rfq || !requisition || copiedFrom.current === requisition.id) return;
    copiedFrom.current = requisition.id;
    setLines(
      requisition.lines.map((line) => ({
        ...createEmptyRfqLine(),
        productVariantId: line.productVariantId,
        quantity: String(line.quantity),
        notes: line.notes ?? '',
      })),
    );
  }, [rfq, requisition]);

  const saving = createRfq.isPending || updateRfq.isPending;

  async function onSubmit(values: HeaderFormValues) {
    setLinesError(null);
    setSuppliersError(null);
    const prepared = prepareLines(lines);
    if (!prepared) {
      setLinesError(t('purchases.rfqs.linesError'));
      return;
    }
    if (supplierIds.length === 0) {
      setSuppliersError(t('purchases.rfqs.suppliersError'));
      return;
    }
    try {
      const saved = rfq
        ? await updateRfq.mutateAsync({
            id: rfq.id,
            input: { notes: values.notes || null, customFields: values.customFields, lines: prepared, supplierIds },
          })
        : await createRfq.mutateAsync({ ...values, notes: values.notes || null, lines: prepared, supplierIds });
      toast.success(t(rfq ? 'purchases.rfqs.updateSuccess' : 'purchases.rfqs.createSuccess'));
      navigate(`${RFQS_PATH}/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(rfq ? 'purchases.rfqs.updateError' : 'purchases.rfqs.createError'));
    }
  }

  useSaveShortcut(() => void form.handleSubmit(onSubmit)(), saving);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DocumentHeaderBar
          backTo={rfq ? `${RFQS_PATH}/${rfq.id}` : RFQS_PATH}
          backLabel={t('documents.back')}
          eyebrow={t('purchases.tabs.rfqs')}
          title={rfq ? t('purchases.rfqs.editTitle', { number: rfq.rfqNumber }) : t('purchases.rfqs.newRfq')}
          status={<Badge variant="neutral">{t(rfqStatusLabelKey('draft'))}</Badge>}
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="sourceRequisitionId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('purchases.rfqs.sourceRequisition')}</FormLabel>
                        {rfq ? (
                          <p className="text-sm text-muted-foreground">{t('purchases.rfqs.sourceFixed')}</p>
                        ) : (
                          <SourceRequisitionField value={field.value} onChange={field.onChange} />
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </SectionCard>

              <SectionCard title={t('documents.lines')} flush>
                <div className="overflow-x-auto p-1">
                  <RfqLineItemsEditor lines={lines} onChange={setLines} />
                </div>
                {linesError ? <p className="px-5 pb-4 text-sm text-destructive">{linesError}</p> : null}
              </SectionCard>

              <SectionCard title={t('purchases.rfqs.invitedSuppliers')} description={t('purchases.rfqs.invitedSuppliersHint')}>
                <SupplierChecklist selectedIds={supplierIds} onChange={setSupplierIds} />
                {suppliersError ? <p className="mt-2 text-sm text-destructive">{suppliersError}</p> : null}
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
              rows={[{ label: t('purchases.rfqs.invitedSuppliers'), value: supplierIds.length }]}
              totalLabel={t('documents.linesCount')}
              totalValue={<span className="tabular-nums">{lines.filter((l) => l.productVariantId).length}</span>}
              footer={
                <Button type="submit" size="lg" disabled={saving}>
                  {t('common.save')}
                </Button>
              }
            />
          }
        />
      </form>
    </Form>
  );
}
