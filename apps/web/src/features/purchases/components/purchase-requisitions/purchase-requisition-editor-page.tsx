import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createPurchaseRequisitionSchema,
  type CreatePurchaseRequisitionLineDto,
  type PurchaseRequisitionWithLinesDto,
} from '@erp-platform/contracts';
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
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';
import { FileQuestion } from 'lucide-react';

import { useCustomFieldDefinitions } from '../../../settings/queries';
import {
  useCreatePurchaseRequisition,
  usePurchaseRequisition,
  useUpdatePurchaseRequisition,
} from '../../api/purchase-requisitions/queries';
import { ApiError } from '../../../../lib/api-client';
import { toWesternDigits } from '../../../../lib/search-normalize';
import { useSaveShortcut } from '../../../../lib/use-save-shortcut';
import { DocumentBody, DocumentHeaderBar, SectionCard, TotalsPanel } from '../../../../components/document/document-layout';
import { BranchField } from './purchase-requisition-form-fields';
import {
  createEmptyLine,
  PurchaseRequisitionLineItemsEditor,
  type PurchaseRequisitionLineDraft,
} from './purchase-requisition-line-items-editor';
import { PURCHASE_REQUISITIONS_PATH, purchaseRequisitionStatusLabelKey } from './purchase-requisition-status';

const PURCHASE_REQUISITION_ENTITY_TYPE = 'purchase_requisition';

type HeaderFormValues = {
  branchId?: string | null;
  neededByDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
};

function prepareLines(lines: PurchaseRequisitionLineDraft[]): CreatePurchaseRequisitionLineDto[] | null {
  if (lines.length === 0) return null;
  const prepared: CreatePurchaseRequisitionLineDto[] = [];
  for (const line of lines) {
    const quantity = Number(toWesternDigits(line.quantity));
    if (!line.productVariantId || !Number.isFinite(quantity) || quantity <= 0) return null;
    prepared.push({ productVariantId: line.productVariantId, quantity, notes: line.notes.trim() === '' ? undefined : line.notes });
  }
  return prepared;
}

/** /purchases/purchase-requisitions/new and /:id/edit (drafts only). */
export function PurchaseRequisitionEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: requisition, isLoading, isError } = usePurchaseRequisition(id);
  const { isLoading: definitionsLoading } = useCustomFieldDefinitions(PURCHASE_REQUISITION_ENTITY_TYPE);
  if ((id && isLoading) || definitionsLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (id && (isError || !requisition || requisition.status !== 'draft')) {
    return <EmptyState icon={<FileQuestion />} title={t('documents.notFound')} />;
  }
  return <RequisitionEditor requisition={id ? requisition : undefined} />;
}

function RequisitionEditor({ requisition }: { requisition: PurchaseRequisitionWithLinesDto | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createRequisition = useCreatePurchaseRequisition();
  const updateRequisition = useUpdatePurchaseRequisition();
  const { data: definitions } = useCustomFieldDefinitions(PURCHASE_REQUISITION_ENTITY_TYPE);
  const [lines, setLines] = useState<PurchaseRequisitionLineDraft[]>(() =>
    requisition && requisition.lines.length > 0
      ? requisition.lines.map((line) => ({
          key: line.id,
          productVariantId: line.productVariantId,
          quantity: String(line.quantity),
          notes: line.notes ?? '',
        }))
      : [createEmptyLine()],
  );
  const [linesError, setLinesError] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = createPurchaseRequisitionSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    const customFields = buildCustomFieldsSchema(definitions);
    return staticSchema.extend({ customFields: requisition ? customFields.partial() : customFields });
  }, [definitions, requisition]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      branchId: requisition?.branchId ?? null,
      neededByDate: requisition?.neededByDate ?? '',
      notes: requisition?.notes ?? '',
      customFields: requisition?.customFields ?? {},
    },
  });

  const saving = createRequisition.isPending || updateRequisition.isPending;
  const filled = lines.filter((l) => l.productVariantId).length;

  async function onSubmit(values: HeaderFormValues) {
    setLinesError(null);
    const prepared = prepareLines(lines);
    if (!prepared) {
      setLinesError(t('purchases.purchaseRequisitions.linesError'));
      return;
    }
    const input = {
      branchId: values.branchId ?? null,
      neededByDate: values.neededByDate || null,
      notes: values.notes || null,
      customFields: values.customFields,
      lines: prepared,
    };
    try {
      const saved = requisition
        ? await updateRequisition.mutateAsync({ id: requisition.id, input })
        : await createRequisition.mutateAsync(input);
      toast.success(
        t(requisition ? 'purchases.purchaseRequisitions.updateSuccess' : 'purchases.purchaseRequisitions.createSuccess'),
      );
      navigate(`${PURCHASE_REQUISITIONS_PATH}/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : t(requisition ? 'purchases.purchaseRequisitions.updateError' : 'purchases.purchaseRequisitions.createError'),
      );
    }
  }

  useSaveShortcut(() => void form.handleSubmit(onSubmit)(), saving);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DocumentHeaderBar
          backTo={requisition ? `${PURCHASE_REQUISITIONS_PATH}/${requisition.id}` : PURCHASE_REQUISITIONS_PATH}
          backLabel={t('documents.back')}
          eyebrow={t('purchases.tabs.purchaseRequisitions')}
          title={
            requisition
              ? t('purchases.purchaseRequisitions.editTitle', { number: requisition.requisitionNumber })
              : t('purchases.purchaseRequisitions.newRequisition')
          }
          status={<Badge variant="neutral">{t(purchaseRequisitionStatusLabelKey('draft'))}</Badge>}
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
                    name="branchId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('purchases.purchaseRequisitions.branch')}</FormLabel>
                        <BranchField value={field.value} onChange={field.onChange} />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="neededByDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('purchases.purchaseRequisitions.neededByDate')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </SectionCard>

              <SectionCard title={t('documents.lines')} flush>
                <div className="overflow-x-auto p-1">
                  <PurchaseRequisitionLineItemsEditor lines={lines} onChange={setLines} />
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
              rows={[]}
              totalLabel={t('documents.linesCount')}
              totalValue={<span className="tabular-nums">{filled}</span>}
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
