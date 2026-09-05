import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createPurchaseRequisitionSchema,
  updatePurchaseRequisitionSchema,
  type CreatePurchaseRequisitionDto,
  type CreatePurchaseRequisitionLineDto,
  type PurchaseRequisitionWithLinesDto,
  type UpdatePurchaseRequisitionDto,
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
  Separator,
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useCustomFieldDefinitions } from '../../../settings/queries';
import {
  useCreatePurchaseRequisition,
  useUpdatePurchaseRequisition,
} from '../../api/purchase-requisitions/queries';
import { ApiError } from '../../../../lib/api-client';
import { BranchField } from './purchase-requisition-form-fields';
import {
  createEmptyLine,
  PurchaseRequisitionLineItemsEditor,
  type PurchaseRequisitionLineDraft,
} from './purchase-requisition-line-items-editor';

const PURCHASE_REQUISITION_ENTITY_TYPE = 'purchase_requisition';

/**
 * Header fields (branchId, neededByDate, notes, customFields) go through react-hook-form +
 * zodResolver, exactly like every other Purchases/Inventory form. The `lines` array does NOT —
 * it's plain useState, merged into the submitted DTO by hand in onSubmit. See
 * PurchaseRequisitionLineItemsEditor's class comment for why (this codebase's first
 * line-item entity, and the existing ApplyLandedCostForm precedent for why a dynamic array
 * isn't safely registered against a static Zod resolver without a working `tsc` here).
 */
type HeaderFormValues = Omit<CreatePurchaseRequisitionDto, 'lines'>;

function prepareLines(lines: PurchaseRequisitionLineDraft[]): CreatePurchaseRequisitionLineDto[] | null {
  if (lines.length === 0) return null;
  const prepared: CreatePurchaseRequisitionLineDto[] = [];
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

export function CreatePurchaseRequisitionForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createRequisition = useCreatePurchaseRequisition();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    PURCHASE_REQUISITION_ENTITY_TYPE,
  );
  const [lines, setLines] = useState<PurchaseRequisitionLineDraft[]>(() => [createEmptyLine()]);
  const [linesError, setLinesError] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = createPurchaseRequisitionSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  // Same documented cast as every other custom-fields-aware form in this codebase (see
  // SupplierForm/WarehouseForm): the runtime-built customFields schema can't structurally
  // match the DTO's `customFields: z.record(z.unknown())` at the type level.
  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: { branchId: null, neededByDate: '', notes: '', customFields: {} },
  });

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const preparedLines = prepareLines(lines);
    if (!preparedLines) {
      setLinesError(t('purchases.purchaseRequisitions.linesError'));
      return;
    }
    try {
      await createRequisition.mutateAsync({
        ...headerValues,
        neededByDate: headerValues.neededByDate || undefined,
        lines: preparedLines,
      });
      toast.success(t('purchases.purchaseRequisitions.createSuccess'));
      form.reset();
      setLines([createEmptyLine()]);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.purchaseRequisitions.createError'));
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
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.purchaseRequisitions.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.purchaseRequisitions.lines')}</p>
        <PurchaseRequisitionLineItemsEditor lines={lines} onChange={setLines} />
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">
              {t('purchases.purchaseRequisitions.customFields')}
            </p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={createRequisition.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

export function EditPurchaseRequisitionForm({
  requisition,
  onDone,
}: {
  requisition: PurchaseRequisitionWithLinesDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const updateRequisition = useUpdatePurchaseRequisition();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    PURCHASE_REQUISITION_ENTITY_TYPE,
  );
  const [lines, setLines] = useState<PurchaseRequisitionLineDraft[]>(() =>
    requisition.lines.length > 0
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
    const staticSchema = updatePurchaseRequisitionSchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions).partial() });
  }, [definitions]);

  const form = useForm<Omit<UpdatePurchaseRequisitionDto, 'lines'>>({
    resolver: zodResolver(formSchema as z.ZodType<Omit<UpdatePurchaseRequisitionDto, 'lines'>>),
    defaultValues: {
      branchId: requisition.branchId,
      neededByDate: requisition.neededByDate ?? '',
      notes: requisition.notes ?? '',
      customFields: requisition.customFields ?? {},
    },
  });

  async function onSubmit(headerValues: Omit<UpdatePurchaseRequisitionDto, 'lines'>) {
    setLinesError(null);
    const preparedLines = prepareLines(lines);
    if (!preparedLines) {
      setLinesError(t('purchases.purchaseRequisitions.linesError'));
      return;
    }
    try {
      await updateRequisition.mutateAsync({
        id: requisition.id,
        input: {
          ...headerValues,
          neededByDate: headerValues.neededByDate || undefined,
          lines: preparedLines,
        },
      });
      toast.success(t('purchases.purchaseRequisitions.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.purchaseRequisitions.updateError'));
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
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.purchaseRequisitions.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.purchaseRequisitions.lines')}</p>
        <PurchaseRequisitionLineItemsEditor lines={lines} onChange={setLines} />
        {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">
              {t('purchases.purchaseRequisitions.customFields')}
            </p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={updateRequisition.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
