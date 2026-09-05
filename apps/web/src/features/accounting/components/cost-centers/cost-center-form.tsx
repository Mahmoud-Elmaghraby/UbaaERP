import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createCostCenterSchema,
  updateCostCenterSchema,
  type CostCenterDto,
  type CreateCostCenterDto,
  type UpdateCostCenterDto,
} from '@erp-platform/contracts';
import {
  buildCustomFieldsSchema,
  Button,
  Checkbox,
  CustomFieldsFormSection,
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

import { useCustomFieldDefinitions } from '../../../settings/queries';
import { useCreateCostCenter, useUpdateCostCenter } from '../../api/cost-centers/queries';
import { ApiError } from '../../../../lib/api-client';

const COST_CENTER_ENTITY_TYPE = 'cost_center';

export function CreateCostCenterForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createCostCenter = useCreateCostCenter();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    COST_CENTER_ENTITY_TYPE,
  );

  const formSchema = useMemo(() => {
    const staticSchema = createCostCenterSchema.omit({ customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<CreateCostCenterDto>({
    resolver: zodResolver(formSchema as z.ZodType<CreateCostCenterDto>),
    defaultValues: { code: '', name: '', notes: '', customFields: {} },
  });

  async function onSubmit(values: CreateCostCenterDto) {
    try {
      await createCostCenter.mutateAsync({ ...values, notes: values.notes || undefined });
      toast.success(t('accounting.costCenters.createSuccess'));
      form.reset();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.costCenters.createError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.costCenters.code')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.costCenters.name')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounting.costCenters.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {definitions && definitions.length > 0 ? (
          <CustomFieldsFormSection definitions={definitions} namePrefix="customFields" />
        ) : null}
        <Button type="submit" disabled={createCostCenter.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

/** Fully editable, unlike EditChartOfAccountForm — a cost center has no tree position
 * or account type to protect (updateCostCenterSchema mirrors create minus nothing). */
export function EditCostCenterForm({ costCenter, onDone }: { costCenter: CostCenterDto; onDone: () => void }) {
  const { t } = useTranslation();
  const updateCostCenter = useUpdateCostCenter();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    COST_CENTER_ENTITY_TYPE,
  );

  const formSchema = useMemo(() => {
    const staticSchema = updateCostCenterSchema.omit({ customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<UpdateCostCenterDto>({
    resolver: zodResolver(formSchema as z.ZodType<UpdateCostCenterDto>),
    defaultValues: {
      code: costCenter.code,
      name: costCenter.name,
      isActive: costCenter.isActive,
      notes: costCenter.notes ?? '',
      customFields: costCenter.customFields,
    },
  });

  useEffect(() => {
    form.reset({
      code: costCenter.code,
      name: costCenter.name,
      isActive: costCenter.isActive,
      notes: costCenter.notes ?? '',
      customFields: costCenter.customFields,
    });
  }, [costCenter, form]);

  async function onSubmit(values: UpdateCostCenterDto) {
    try {
      await updateCostCenter.mutateAsync({
        id: costCenter.id,
        input: { ...values, notes: values.notes || undefined },
      });
      toast.success(t('accounting.costCenters.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.costCenters.updateError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.costCenters.code')}</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.costCenters.name')}</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value ?? true} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel>{t('accounting.costCenters.isActive')}</FormLabel>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounting.costCenters.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {definitions && definitions.length > 0 ? (
          <CustomFieldsFormSection definitions={definitions} namePrefix="customFields" />
        ) : null}
        <Button type="submit" disabled={updateCostCenter.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
