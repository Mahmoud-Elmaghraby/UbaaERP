import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createFiscalYearSchema, type CreateFiscalYearDto } from '@erp-platform/contracts';
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
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useCustomFieldDefinitions } from '../../../settings/queries';
import { useCreateFiscalYear } from '../../api/fiscal-years/queries';
import { ApiError } from '../../../../lib/api-client';

const FISCAL_YEAR_ENTITY_TYPE = 'fiscal_year';

/**
 * Create only — no EditFiscalYearForm. updateFiscalYearSchema only allows name/notes/
 * customFields (dates are immutable after creation — accounting_periods are generated
 * from them at create time, see that schema's own comment), and this module's fiscal
 * years frontend doesn't expose even that narrow rename yet since it's rarely needed
 * in practice (tracked as a small future addition, not a gap in create/read/lifecycle
 * coverage). Creating a fiscal year also auto-generates its accounting_periods
 * (FiscalYearsService.create()) — the create success message says so.
 */
export function CreateFiscalYearForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createFiscalYear = useCreateFiscalYear();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    FISCAL_YEAR_ENTITY_TYPE,
  );

  const formSchema = useMemo(() => {
    const staticSchema = createFiscalYearSchema.omit({ customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<CreateFiscalYearDto>({
    resolver: zodResolver(formSchema as z.ZodType<CreateFiscalYearDto>),
    defaultValues: { name: '', startDate: '', endDate: '', notes: '', customFields: {} },
  });

  async function onSubmit(values: CreateFiscalYearDto) {
    try {
      await createFiscalYear.mutateAsync({ ...values, notes: values.notes || undefined });
      toast.success(t('accounting.fiscalYears.createSuccess'));
      form.reset();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.fiscalYears.createError'));
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounting.fiscalYears.name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.fiscalYears.startDate')}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.fiscalYears.endDate')}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ''} />
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
              <FormLabel>{t('accounting.fiscalYears.notes')}</FormLabel>
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
        <Button type="submit" disabled={createFiscalYear.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
