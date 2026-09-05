import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  type CreateWarehouseDto,
  type UpdateWarehouseDto,
  type WarehouseDto,
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
  Separator,
  Skeleton,
  toast,
} from '@erp-platform/ui';

import { useCustomFieldDefinitions } from '../../../settings/queries';
import { useCreateWarehouse, useUpdateWarehouse } from '../../api/warehouses/queries';
import { ApiError } from '../../../../lib/api-client';
import { BranchField } from './warehouse-form-fields';

const WAREHOUSE_ENTITY_TYPE = 'warehouse';

/** Same dynamic-custom-fields pattern as BranchesTab (CLAUDE.md §7). */
export function CreateWarehouseForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createWarehouse = useCreateWarehouse();
  const { data: definitions, isLoading: definitionsLoading } =
    useCustomFieldDefinitions(WAREHOUSE_ENTITY_TYPE);

  const formSchema = useMemo(() => {
    const staticSchema = createWarehouseSchema.omit({ customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  // See BranchesTab's CreateBranchForm for why this cast is needed: the
  // runtime-built customFields schema can't structurally match
  // CreateWarehouseDto's `customFields: z.record(z.unknown())` at the type level.
  const form = useForm<CreateWarehouseDto>({
    resolver: zodResolver(formSchema as z.ZodType<CreateWarehouseDto>),
    defaultValues: { name: '', code: '', address: '', branchId: null, isActive: true, customFields: {} },
  });

  async function onSubmit(values: CreateWarehouseDto) {
    try {
      await createWarehouse.mutateAsync(values);
      toast.success(t('inventory.warehouses.createSuccess'));
      form.reset();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.warehouses.createError'));
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
              <FormLabel>{t('inventory.warehouses.name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.warehouses.code')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.warehouses.address')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="branchId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.warehouses.branch')}</FormLabel>
              <BranchField value={field.value} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
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

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">
              {t('inventory.warehouses.customFields')}
            </p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={createWarehouse.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

export function EditWarehouseForm({ warehouse, onDone }: { warehouse: WarehouseDto; onDone: () => void }) {
  const { t } = useTranslation();
  const updateWarehouse = useUpdateWarehouse();
  const { data: definitions, isLoading: definitionsLoading } =
    useCustomFieldDefinitions(WAREHOUSE_ENTITY_TYPE);

  const formSchema = useMemo(() => {
    const staticSchema = updateWarehouseSchema.omit({ customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions).partial() });
  }, [definitions]);

  const form = useForm<UpdateWarehouseDto>({
    resolver: zodResolver(formSchema as z.ZodType<UpdateWarehouseDto>),
    defaultValues: {
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address ?? '',
      branchId: warehouse.branchId,
      isActive: warehouse.isActive,
      customFields: warehouse.customFields ?? {},
    },
  });

  async function onSubmit(values: UpdateWarehouseDto) {
    try {
      await updateWarehouse.mutateAsync({ id: warehouse.id, input: values });
      toast.success(t('inventory.warehouses.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.warehouses.updateError'));
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
              <FormLabel>{t('inventory.warehouses.name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.warehouses.code')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.warehouses.address')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="branchId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.warehouses.branch')}</FormLabel>
              <BranchField value={field.value} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
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

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">
              {t('inventory.warehouses.customFields')}
            </p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={updateWarehouse.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
