import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createRfqSchema,
  updateRfqSchema,
  type CreateRfqDto,
  type CreateRfqLineDto,
  type RfqWithDetailsDto,
  type UpdateRfqDto,
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
  Separator,
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useCustomFieldDefinitions } from '../../../settings/queries';
import { useCreateRfq, useUpdateRfq } from '../../api/rfqs/queries';
import { ApiError } from '../../../../lib/api-client';
import { SourceRequisitionField, SupplierChecklist } from './rfq-form-fields';
import { createEmptyRfqLine, RfqLineItemsEditor, type RfqLineDraft } from './rfq-line-items-editor';

const RFQ_ENTITY_TYPE = 'rfq';

/**
 * Same split as PurchaseRequisitionForm: header fields (sourceRequisitionId, notes,
 * customFields) through react-hook-form + zodResolver, `lines` AND `supplierIds` as plain
 * useState merged into the DTO by hand in onSubmit — see
 * purchase-requisition-line-items-editor.tsx's class comment for why a dynamic array isn't
 * registered against the Zod resolver via useFieldArray in this session.
 */
type HeaderFormValues = Omit<CreateRfqDto, 'lines' | 'supplierIds'>;

function prepareLines(lines: RfqLineDraft[]): CreateRfqLineDto[] | null {
  if (lines.length === 0) return null;
  const prepared: CreateRfqLineDto[] = [];
  for (const line of lines) {
    const quantity = Number(line.quantity);
    if (!line.productVariantId || !Number.isFinite(quantity) || quantity <= 0) return null;
    prepared.push({
      productVariantId: line.productVariantId,
      quantity,
      notes: line.notes.trim() === '' ? undefined : line.notes,
    });
  }
  return prepared;
}

export function CreateRfqForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createRfq = useCreateRfq();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(RFQ_ENTITY_TYPE);
  const [lines, setLines] = useState<RfqLineDraft[]>(() => [createEmptyRfqLine()]);
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [linesError, setLinesError] = useState<string | null>(null);
  const [suppliersError, setSuppliersError] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = createRfqSchema.omit({ lines: true, supplierIds: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: { sourceRequisitionId: null, notes: '', customFields: {} },
  });

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    setSuppliersError(null);
    const preparedLines = prepareLines(lines);
    if (!preparedLines) {
      setLinesError(t('purchases.rfqs.linesError'));
      return;
    }
    if (supplierIds.length === 0) {
      setSuppliersError(t('purchases.rfqs.suppliersError'));
      return;
    }
    try {
      await createRfq.mutateAsync({ ...headerValues, lines: preparedLines, supplierIds });
      toast.success(t('purchases.rfqs.createSuccess'));
      form.reset();
      setLines([createEmptyRfqLine()]);
      setSupplierIds([]);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.rfqs.createError'));
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
          name="sourceRequisitionId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.rfqs.sourceRequisition')}</FormLabel>
              <SourceRequisitionField value={field.value} onChange={field.onChange} />
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
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.rfqs.invitedSuppliers')}</p>
        <SupplierChecklist selectedIds={supplierIds} onChange={setSupplierIds} />
        {suppliersError ? <p className="text-sm text-destructive">{suppliersError}</p> : null}

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.rfqs.lines')}</p>
        <RfqLineItemsEditor lines={lines} onChange={setLines} />
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('purchases.rfqs.customFields')}</p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={createRfq.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

export function EditRfqForm({ rfq, onDone }: { rfq: RfqWithDetailsDto; onDone: () => void }) {
  const { t } = useTranslation();
  const updateRfq = useUpdateRfq();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(RFQ_ENTITY_TYPE);
  const [lines, setLines] = useState<RfqLineDraft[]>(() =>
    rfq.lines.length > 0
      ? rfq.lines.map((line) => ({
          key: line.id,
          productVariantId: line.productVariantId,
          quantity: String(line.quantity),
          notes: line.notes ?? '',
        }))
      : [createEmptyRfqLine()],
  );
  const [supplierIds, setSupplierIds] = useState<string[]>(() => rfq.supplierIds);
  const [linesError, setLinesError] = useState<string | null>(null);
  const [suppliersError, setSuppliersError] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = updateRfqSchema.omit({ lines: true, supplierIds: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions).partial() });
  }, [definitions]);

  const form = useForm<Omit<UpdateRfqDto, 'lines' | 'supplierIds'>>({
    resolver: zodResolver(formSchema as z.ZodType<Omit<UpdateRfqDto, 'lines' | 'supplierIds'>>),
    defaultValues: {
      notes: rfq.notes ?? '',
      customFields: rfq.customFields ?? {},
    },
  });

  async function onSubmit(headerValues: Omit<UpdateRfqDto, 'lines' | 'supplierIds'>) {
    setLinesError(null);
    setSuppliersError(null);
    const preparedLines = prepareLines(lines);
    if (!preparedLines) {
      setLinesError(t('purchases.rfqs.linesError'));
      return;
    }
    if (supplierIds.length === 0) {
      setSuppliersError(t('purchases.rfqs.suppliersError'));
      return;
    }
    try {
      await updateRfq.mutateAsync({
        id: rfq.id,
        input: { ...headerValues, lines: preparedLines, supplierIds },
      });
      toast.success(t('purchases.rfqs.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.rfqs.updateError'));
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
              <FormLabel>{t('purchases.rfqs.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.rfqs.invitedSuppliers')}</p>
        <SupplierChecklist selectedIds={supplierIds} onChange={setSupplierIds} />
        {suppliersError ? <p className="text-sm text-destructive">{suppliersError}</p> : null}

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.rfqs.lines')}</p>
        <RfqLineItemsEditor lines={lines} onChange={setLines} />
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('purchases.rfqs.customFields')}</p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={updateRfq.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
