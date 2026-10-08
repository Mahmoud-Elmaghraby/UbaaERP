import { useEffect, useMemo } from 'react';
import { TaxRuleSelect } from '../../../../components/document/tax-rule-select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createSupplierSchema,
  updateSupplierSchema,
  type CreateSupplierDto,
  type SupplierDto,
  type UpdateSupplierDto,
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
  Textarea,
  toast,
  useHasFeature,
} from '@erp-platform/ui';

import { AttachmentsPanel } from '../../../attachments/components/attachments-panel';
import { useCustomFieldDefinitions, useTenantSettings } from '../../../settings/queries';
import { useCreateSupplier, useUpdateSupplier } from '../../api/suppliers/queries';
import { ApiError } from '../../../../lib/api-client';
import { WhenTaxesInUse } from '../../../../components/taxes/when-taxes-in-use';

const SUPPLIER_ENTITY_TYPE = 'supplier';

/** See customer-form.tsx's identical constant for the full rationale. */
const MULTI_CURRENCY_FEATURE_KEY = 'multi_currency';

/** Same dynamic-custom-fields pattern as Inventory's WarehouseForm (CLAUDE.md §7). */
export function CreateSupplierForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createSupplier = useCreateSupplier();
  const { data: definitions, isLoading: definitionsLoading } =
    useCustomFieldDefinitions(SUPPLIER_ENTITY_TYPE);
  const multiCurrencyEnabled = useHasFeature(MULTI_CURRENCY_FEATURE_KEY);
  const { data: tenantSettings } = useTenantSettings();

  const formSchema = useMemo(() => {
    const staticSchema = createSupplierSchema.omit({ customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  // Same documented cast as WarehouseForm/BranchesTab: the runtime-built
  // customFields schema can't structurally match CreateSupplierDto's
  // `customFields: z.record(z.unknown())` at the type level.
  const form = useForm<CreateSupplierDto>({
    resolver: zodResolver(formSchema as z.ZodType<CreateSupplierDto>),
    defaultValues: {
      name: '',
      code: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      taxNumber: '',
      withholdingTaxRuleId: null,
      defaultCurrency: '',
      paymentTermsDays: null,
      notes: '',
      isActive: true,
      customFields: {},
    },
  });

  // Multi-currency gate — see CreateCustomerForm's identical effect for
  // the full rationale.
  useEffect(() => {
    if (!multiCurrencyEnabled && tenantSettings) {
      form.setValue('defaultCurrency', tenantSettings.currencyCode);
    }
  }, [multiCurrencyEnabled, tenantSettings, form]);

  async function onSubmit(values: CreateSupplierDto) {
    try {
      await createSupplier.mutateAsync(values);
      toast.success(t('purchases.suppliers.createSuccess'));
      form.reset();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.suppliers.createError'));
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
              <FormLabel>{t('purchases.suppliers.name')}</FormLabel>
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
              <FormLabel>{t('purchases.suppliers.code')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contactPerson"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.suppliers.contactPerson')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.suppliers.email')}</FormLabel>
              <FormControl>
                <Input type="email" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.suppliers.phone')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
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
              <FormLabel>{t('purchases.suppliers.address')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="taxNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.suppliers.taxNumber')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <WhenTaxesInUse scope="purchases">
          <FormField
            control={form.control}
            name="withholdingTaxRuleId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('taxes.partyWithholding')}</FormLabel>
                <TaxRuleSelect
                  kind="withholding"
                  scope="purchases"
                  value={field.value ?? null}
                  onChange={field.onChange}
                  noneLabel={t('taxes.noWithholding')}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </WhenTaxesInUse>
        <FormField
          control={form.control}
          name="defaultCurrency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.suppliers.defaultCurrency')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={!multiCurrencyEnabled}
                  placeholder="SAR"
                  maxLength={3}
                  className="uppercase"
                />
              </FormControl>
              {!multiCurrencyEnabled ? (
                <p className="text-xs text-muted-foreground">{t('purchases.suppliers.multiCurrencyDisabledHint')}</p>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="paymentTermsDays"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.suppliers.paymentTermsDays')}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                />
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
              <FormLabel>{t('purchases.suppliers.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
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
              {t('purchases.suppliers.customFields')}
            </p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={createSupplier.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

export function EditSupplierForm({ supplier, onDone }: { supplier: SupplierDto; onDone: () => void }) {
  const { t } = useTranslation();
  const updateSupplier = useUpdateSupplier();
  const { data: definitions, isLoading: definitionsLoading } =
    useCustomFieldDefinitions(SUPPLIER_ENTITY_TYPE);
  // See EditCustomerForm's identical comment: read-only here, never
  // force-overwritten, so an existing foreign-currency supplier's
  // currency never changes as a side effect of an unrelated edit.
  const multiCurrencyEnabled = useHasFeature(MULTI_CURRENCY_FEATURE_KEY);

  const formSchema = useMemo(() => {
    const staticSchema = updateSupplierSchema.omit({ customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions).partial() });
  }, [definitions]);

  const form = useForm<UpdateSupplierDto>({
    resolver: zodResolver(formSchema as z.ZodType<UpdateSupplierDto>),
    defaultValues: {
      name: supplier.name,
      code: supplier.code,
      contactPerson: supplier.contactPerson ?? '',
      email: supplier.email ?? '',
      phone: supplier.phone ?? '',
      address: supplier.address ?? '',
      taxNumber: supplier.taxNumber ?? '',
      withholdingTaxRuleId: supplier.withholdingTaxRuleId ?? null,
      defaultCurrency: supplier.defaultCurrency,
      paymentTermsDays: supplier.paymentTermsDays,
      notes: supplier.notes ?? '',
      isActive: supplier.isActive,
      customFields: supplier.customFields ?? {},
    },
  });

  async function onSubmit(values: UpdateSupplierDto) {
    try {
      await updateSupplier.mutateAsync({ id: supplier.id, input: values });
      toast.success(t('purchases.suppliers.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.suppliers.updateError'));
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
              <FormLabel>{t('purchases.suppliers.name')}</FormLabel>
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
              <FormLabel>{t('purchases.suppliers.code')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contactPerson"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.suppliers.contactPerson')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.suppliers.email')}</FormLabel>
              <FormControl>
                <Input type="email" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.suppliers.phone')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
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
              <FormLabel>{t('purchases.suppliers.address')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="taxNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.suppliers.taxNumber')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <WhenTaxesInUse scope="purchases">
          <FormField
            control={form.control}
            name="withholdingTaxRuleId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('taxes.partyWithholding')}</FormLabel>
                <TaxRuleSelect
                  kind="withholding"
                  scope="purchases"
                  value={field.value ?? null}
                  onChange={field.onChange}
                  noneLabel={t('taxes.noWithholding')}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </WhenTaxesInUse>
        <FormField
          control={form.control}
          name="defaultCurrency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.suppliers.defaultCurrency')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  disabled={!multiCurrencyEnabled}
                  placeholder="SAR"
                  maxLength={3}
                  className="uppercase"
                />
              </FormControl>
              {!multiCurrencyEnabled ? (
                <p className="text-xs text-muted-foreground">{t('purchases.suppliers.multiCurrencyDisabledHint')}</p>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="paymentTermsDays"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.suppliers.paymentTermsDays')}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                />
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
              <FormLabel>{t('purchases.suppliers.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
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
              {t('purchases.suppliers.customFields')}
            </p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={updateSupplier.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>

      <AttachmentsPanel entityType="supplier" entityId={supplier.id} />
    </Form>
  );
}
