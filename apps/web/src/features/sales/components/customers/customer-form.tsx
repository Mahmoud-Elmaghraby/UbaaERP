import { useEffect, useMemo } from 'react';
import { TaxRuleSelect } from '../../../../components/document/tax-rule-select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createCustomerSchema,
  updateCustomerSchema,
  type CreateCustomerDto,
  type CustomerDto,
  type UpdateCustomerDto,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Textarea,
  toast,
  useHasFeature,
} from '@erp-platform/ui';

import { AttachmentsPanel } from '../../../attachments/components/attachments-panel';
import { useCustomFieldDefinitions, useTenantSettings } from '../../../settings/queries';
import { useCreateCustomer, useUpdateCustomer } from '../../api/customers/queries';
import { ApiError } from '../../../../lib/api-client';
import { WhenTaxesInUse } from '../../../../components/taxes/when-taxes-in-use';
import { CurrencySelect } from '../../../../components/document/currency-select';

/**
 * Feature key from apps/api's FEATURE_KEYS.MULTI_CURRENCY (shared/plans/
 * feature-catalog.ts) — passed as a plain string, same convention
 * permission keys already use with useHasPermission()/<Can>. When off
 * (the default for a new tenant — see that key's own comment), a
 * customer's defaultCurrency can only ever be the tenant's own currency:
 * that field is what every Sales document derives its own currency from
 * (QuotationLineItemsEditor's own comment), so locking it here is what
 * actually keeps a foreign currency out of Sales documents when the
 * tenant hasn't turned Multi-Currency on.
 */
const MULTI_CURRENCY_FEATURE_KEY = 'multi_currency';

const CUSTOMER_ENTITY_TYPE = 'customer';

/** Same shape as Purchases' SupplierForm — Customers is Sales' structurally closest
 * analog to Suppliers, plus one extra field (customerType) the backend carries that
 * Suppliers doesn't. Same dynamic-custom-fields pattern (CLAUDE.md §7). */
export function CreateCustomerForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createCustomer = useCreateCustomer();
  const { data: definitions, isLoading: definitionsLoading } =
    useCustomFieldDefinitions(CUSTOMER_ENTITY_TYPE);
  const multiCurrencyEnabled = useHasFeature(MULTI_CURRENCY_FEATURE_KEY);
  const { data: tenantSettings } = useTenantSettings();

  const formSchema = useMemo(() => {
    const staticSchema = createCustomerSchema.omit({ customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  // Same documented cast as SupplierForm: the runtime-built customFields schema
  // can't structurally match CreateCustomerDto's `customFields: z.record(z.unknown())`
  // at the type level.
  const form = useForm<CreateCustomerDto>({
    resolver: zodResolver(formSchema as z.ZodType<CreateCustomerDto>),
    defaultValues: {
      name: '',
      code: '',
      customerType: 'business',
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

  // Multi-currency gate (claude/multi-currency-strategy.md §9): when the
  // tenant hasn't turned Multi-Currency on, a NEW customer's defaultCurrency
  // is forced to the tenant's own currency as soon as it's known — the input
  // below is also disabled, but this keeps the actually-submitted value
  // correct even before the field is touched.
  useEffect(() => {
    if (!multiCurrencyEnabled && tenantSettings) {
      form.setValue('defaultCurrency', tenantSettings.currencyCode);
    }
  }, [multiCurrencyEnabled, tenantSettings, form]);

  async function onSubmit(values: CreateCustomerDto) {
    try {
      await createCustomer.mutateAsync(values);
      toast.success(t('sales.customers.createSuccess'));
      form.reset();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.customers.createError'));
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
              <FormLabel>{t('sales.customers.name')}</FormLabel>
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
              <FormLabel>{t('sales.customers.code')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} placeholder={t("common.autoCodePlaceholder")} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="customerType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.customers.customerType')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="business">{t('sales.customers.customerTypeBusiness')}</SelectItem>
                  <SelectItem value="individual">{t('sales.customers.customerTypeIndividual')}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contactPerson"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.customers.contactPerson')}</FormLabel>
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
              <FormLabel>{t('sales.customers.email')}</FormLabel>
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
              <FormLabel>{t('sales.customers.phone')}</FormLabel>
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
              <FormLabel>{t('sales.customers.address')}</FormLabel>
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
              <FormLabel>{t('sales.customers.taxNumber')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <WhenTaxesInUse scope="sales">
          <FormField
            control={form.control}
            name="withholdingTaxRuleId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('taxes.partyWithholding')}</FormLabel>
                <TaxRuleSelect
                  kind="withholding"
                  scope="sales"
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
              <FormLabel>{t('sales.customers.defaultCurrency')}</FormLabel>
              <FormControl>
                <CurrencySelect value={field.value} onChange={field.onChange} disabled={!multiCurrencyEnabled} />
              </FormControl>
              {!multiCurrencyEnabled ? (
                <p className="text-xs text-muted-foreground">{t('sales.customers.multiCurrencyDisabledHint')}</p>
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
              <FormLabel>{t('sales.customers.paymentTermsDays')}</FormLabel>
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
              <FormLabel>{t('sales.customers.notes')}</FormLabel>
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
              {t('sales.customers.customFields')}
            </p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={createCustomer.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

export function EditCustomerForm({ customer, onDone }: { customer: CustomerDto; onDone: () => void }) {
  const { t } = useTranslation();
  const updateCustomer = useUpdateCustomer();
  const { data: definitions, isLoading: definitionsLoading } =
    useCustomFieldDefinitions(CUSTOMER_ENTITY_TYPE);
  // Unlike the Create form, an existing customer keeps whatever
  // defaultCurrency it already has when Multi-Currency is off — the field
  // is just made read-only here, never force-overwritten, so an unrelated
  // edit (e.g. fixing a phone number) can never silently change a foreign
  // customer's currency as a side effect.
  const multiCurrencyEnabled = useHasFeature(MULTI_CURRENCY_FEATURE_KEY);

  const formSchema = useMemo(() => {
    const staticSchema = updateCustomerSchema.omit({ customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions).partial() });
  }, [definitions]);

  const form = useForm<UpdateCustomerDto>({
    resolver: zodResolver(formSchema as z.ZodType<UpdateCustomerDto>),
    defaultValues: {
      name: customer.name,
      code: customer.code,
      customerType: customer.customerType,
      contactPerson: customer.contactPerson ?? '',
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      address: customer.address ?? '',
      taxNumber: customer.taxNumber ?? '',
      withholdingTaxRuleId: customer.withholdingTaxRuleId ?? null,
      defaultCurrency: customer.defaultCurrency,
      paymentTermsDays: customer.paymentTermsDays,
      notes: customer.notes ?? '',
      isActive: customer.isActive,
      customFields: customer.customFields ?? {},
    },
  });

  async function onSubmit(values: UpdateCustomerDto) {
    try {
      await updateCustomer.mutateAsync({ id: customer.id, input: values });
      toast.success(t('sales.customers.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.customers.updateError'));
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
              <FormLabel>{t('sales.customers.name')}</FormLabel>
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
              <FormLabel>{t('sales.customers.code')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="customerType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.customers.customerType')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="business">{t('sales.customers.customerTypeBusiness')}</SelectItem>
                  <SelectItem value="individual">{t('sales.customers.customerTypeIndividual')}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contactPerson"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.customers.contactPerson')}</FormLabel>
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
              <FormLabel>{t('sales.customers.email')}</FormLabel>
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
              <FormLabel>{t('sales.customers.phone')}</FormLabel>
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
              <FormLabel>{t('sales.customers.address')}</FormLabel>
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
              <FormLabel>{t('sales.customers.taxNumber')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <WhenTaxesInUse scope="sales">
          <FormField
            control={form.control}
            name="withholdingTaxRuleId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('taxes.partyWithholding')}</FormLabel>
                <TaxRuleSelect
                  kind="withholding"
                  scope="sales"
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
              <FormLabel>{t('sales.customers.defaultCurrency')}</FormLabel>
              <FormControl>
                <CurrencySelect value={field.value} onChange={field.onChange} disabled={!multiCurrencyEnabled} />
              </FormControl>
              {!multiCurrencyEnabled ? (
                <p className="text-xs text-muted-foreground">{t('sales.customers.multiCurrencyDisabledHint')}</p>
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
              <FormLabel>{t('sales.customers.paymentTermsDays')}</FormLabel>
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
              <FormLabel>{t('sales.customers.notes')}</FormLabel>
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
              {t('sales.customers.customFields')}
            </p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={updateCustomer.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>

      <AttachmentsPanel entityType="customer" entityId={customer.id} />
    </Form>
  );
}
