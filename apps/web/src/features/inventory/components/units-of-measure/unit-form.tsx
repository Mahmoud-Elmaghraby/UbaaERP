import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import {
  createUnitOfMeasureSchema,
  updateUnitOfMeasureSchema,
  type CreateUnitOfMeasureDto,
  type UnitOfMeasureDto,
  type UpdateUnitOfMeasureDto,
} from '@erp-platform/contracts';
import {
  Button,
  Checkbox,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  toast,
} from '@erp-platform/ui';

import { useCreateUnitOfMeasure, useUpdateUnitOfMeasure } from '../../api/units-of-measure/queries';
import { ApiError } from '../../../../lib/api-client';
import { BaseUnitField } from './unit-form-fields';

export function CreateUnitOfMeasureForm({
  units,
  onDone,
}: {
  units: UnitOfMeasureDto[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const createUnit = useCreateUnitOfMeasure();
  const baseUnitOptions = units.filter((candidate) => !candidate.baseUnitId);

  const form = useForm<CreateUnitOfMeasureDto>({
    resolver: zodResolver(createUnitOfMeasureSchema),
    defaultValues: { name: '', symbol: '', baseUnitId: null, conversionFactor: 1, isActive: true },
  });

  const baseUnitId = form.watch('baseUnitId');

  async function onSubmit(values: CreateUnitOfMeasureDto) {
    const payload = values.baseUnitId
      ? values
      : { ...values, baseUnitId: null, conversionFactor: undefined };
    try {
      await createUnit.mutateAsync(payload);
      toast.success(t('inventory.unitsOfMeasure.createSuccess'));
      form.reset();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.unitsOfMeasure.createError'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.unitsOfMeasure.name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="symbol"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.unitsOfMeasure.symbol')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="baseUnitId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.unitsOfMeasure.baseUnit')}</FormLabel>
              <BaseUnitField value={field.value} onChange={field.onChange} options={baseUnitOptions} />
              <FormMessage />
            </FormItem>
          )}
        />
        {baseUnitId ? (
          <FormField
            control={form.control}
            name="conversionFactor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('inventory.unitsOfMeasure.conversionFactor')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0">{t('common.active')}</FormLabel>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={createUnit.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

export function EditUnitOfMeasureForm({
  units,
  unit,
  onDone,
}: {
  units: UnitOfMeasureDto[];
  unit: UnitOfMeasureDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const updateUnit = useUpdateUnitOfMeasure();
  const baseUnitOptions = units.filter((candidate) => !candidate.baseUnitId && candidate.id !== unit.id);

  const form = useForm<UpdateUnitOfMeasureDto>({
    resolver: zodResolver(updateUnitOfMeasureSchema),
    defaultValues: {
      name: unit.name,
      symbol: unit.symbol,
      baseUnitId: unit.baseUnitId,
      conversionFactor: unit.conversionFactor,
      isActive: unit.isActive,
    },
  });

  const baseUnitId = form.watch('baseUnitId');

  async function onSubmit(values: UpdateUnitOfMeasureDto) {
    const payload = values.baseUnitId
      ? values
      : { ...values, baseUnitId: null, conversionFactor: undefined };
    try {
      await updateUnit.mutateAsync({ id: unit.id, input: payload });
      toast.success(t('inventory.unitsOfMeasure.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.unitsOfMeasure.updateError'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.unitsOfMeasure.name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="symbol"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.unitsOfMeasure.symbol')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="baseUnitId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.unitsOfMeasure.baseUnit')}</FormLabel>
              <BaseUnitField value={field.value} onChange={field.onChange} options={baseUnitOptions} />
              <FormMessage />
            </FormItem>
          )}
        />
        {baseUnitId ? (
          <FormField
            control={form.control}
            name="conversionFactor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('inventory.unitsOfMeasure.conversionFactor')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0">{t('common.active')}</FormLabel>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={updateUnit.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
