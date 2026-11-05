import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createCustomerSchema, type CreateCustomerDto, type CustomerDto } from '@erp-platform/contracts';
import {
  buildCustomFieldsSchema,
  Button,
  Checkbox,
  CustomFieldsFormSection,
  EmptyState,
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
  Skeleton,
  Textarea,
  toast,
  useHasFeature,
} from '@erp-platform/ui';
import { FileQuestion } from 'lucide-react';

import { useCustomFieldDefinitions, useTenantSettings } from '../../../settings/queries';
import { useCreateCustomer, useCustomer, useUpdateCustomer } from '../../api/customers/queries';
import { PriceListSelect } from '../price-lists/price-list-select';
import { SalesRepSelect } from '../sales-reps/sales-rep-select';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../../lib/money';
import { FEATURE_KEYS } from '../../../../lib/feature-keys';
import { WhenTaxesInUse } from '../../../../components/taxes/when-taxes-in-use';
import { TaxRuleSelect } from '../../../../components/document/tax-rule-select';
import { CurrencySelect } from '../../../../components/document/currency-select';
import { DocumentBody, DocumentHeaderBar, SectionCard } from '../../../../components/document/document-layout';

const CUSTOMER_ENTITY_TYPE = 'customer';
const CUSTOMERS_PATH = '/sales/customers';

/** Optional text inputs: the form holds '' for "empty", the API gets null. */
const NULLABLE_TEXT_FIELDS = ['contactPerson', 'email', 'phone', 'address', 'taxNumber', 'notes'] as const;

/** /sales/customers/new and /sales/customers/:id/edit — one form, two modes. */
export function CustomerEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: customer, isLoading, isError } = useCustomer(id);
  const { isLoading: definitionsLoading } = useCustomFieldDefinitions(CUSTOMER_ENTITY_TYPE);

  if ((id && isLoading) || definitionsLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (id && (isError || !customer)) {
    return <EmptyState icon={<FileQuestion />} title={t('sales.customers.notFound')} />;
  }
  return <CustomerEditor customer={id ? customer : undefined} />;
}

function CustomerEditor({ customer }: { customer: CustomerDto | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mode = customer ? 'edit' : 'create';
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const { data: definitions } = useCustomFieldDefinitions(CUSTOMER_ENTITY_TYPE);
  const { data: tenantSettings } = useTenantSettings();
  /*
   * Multi-currency gate (claude/multi-currency-strategy.md §9): a customer's
   * defaultCurrency is what every Sales document derives its currency from.
   * With Multi-Currency off a NEW customer is forced to the tenant currency;
   * an existing one keeps whatever it has (the field is only made read-only),
   * so an unrelated edit never silently changes a foreign customer's currency.
   */
  const multiCurrencyEnabled = useHasFeature(FEATURE_KEYS.MULTI_CURRENCY);

  const formSchema = useMemo(() => {
    const staticSchema = createCustomerSchema
      .omit({ customFields: true })
      // The input holds '' for "no email"; it becomes null on submit.
      .extend({ email: z.union([z.literal(''), z.string().email()]).nullable().optional() });
    if (!definitions) return staticSchema;
    const customFields = buildCustomFieldsSchema(definitions);
    // Existing customers may predate a required custom field — editing must not be blocked by it.
    return staticSchema.extend({ customFields: mode === 'edit' ? customFields.partial() : customFields });
  }, [definitions, mode]);

  // Runtime-built customFields schema can't structurally match the DTO's record type.
  const form = useForm<CreateCustomerDto>({
    resolver: zodResolver(formSchema as z.ZodType<CreateCustomerDto>),
    defaultValues: {
      name: customer?.name ?? '',
      code: customer?.code ?? '',
      customerType: customer?.customerType ?? 'business',
      contactPerson: customer?.contactPerson ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      address: customer?.address ?? '',
      taxNumber: customer?.taxNumber ?? '',
      withholdingTaxRuleId: customer?.withholdingTaxRuleId ?? null,
      defaultCurrency: customer?.defaultCurrency ?? '',
      paymentTermsDays: customer?.paymentTermsDays ?? null,
      priceListId: customer?.priceListId ?? null,
      creditLimitMinorUnits: customer?.creditLimitMinorUnits ?? null,
      salesRepId: customer?.salesRepId ?? null,
      notes: customer?.notes ?? '',
      isActive: customer?.isActive ?? true,
      customFields: customer?.customFields ?? {},
    },
  });

  useEffect(() => {
    if (mode === 'create' && !multiCurrencyEnabled && tenantSettings) {
      form.setValue('defaultCurrency', tenantSettings.currencyCode);
    }
  }, [mode, multiCurrencyEnabled, tenantSettings, form]);

  const saving = createCustomer.isPending || updateCustomer.isPending;

  async function onSubmit(values: CreateCustomerDto) {
    const input: CreateCustomerDto = { ...values };
    for (const key of NULLABLE_TEXT_FIELDS) {
      const value = input[key];
      if (typeof value === 'string' && value.trim() === '') input[key] = null;
    }
    // Create: empty code → next automatic code. Edit: an emptied code keeps the current one.
    if (!input.code?.trim()) delete input.code;
    try {
      const saved = customer
        ? await updateCustomer.mutateAsync({ id: customer.id, input })
        : await createCustomer.mutateAsync(input);
      toast.success(t(customer ? 'sales.customers.updateSuccess' : 'sales.customers.createSuccess'));
      navigate(`${CUSTOMERS_PATH}/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : t(customer ? 'sales.customers.updateError' : 'sales.customers.createError'),
      );
    }
  }

  // Ctrl/⌘+S saves.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void form.handleSubmit(onSubmit)();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const textField = (
    name: 'name' | 'code' | 'contactPerson' | 'phone' | 'address' | 'taxNumber',
    label: string,
    extra?: { placeholder?: string; dir?: 'ltr'; wide?: boolean },
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={extra?.wide ? 'sm:col-span-2' : undefined}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} value={field.value ?? ''} placeholder={extra?.placeholder} dir={extra?.dir} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DocumentHeaderBar
          backTo={customer ? `${CUSTOMERS_PATH}/${customer.id}` : CUSTOMERS_PATH}
          backLabel={t('documents.back')}
          eyebrow={t('sales.tabs.customers')}
          title={customer ? t('sales.customers.editTitle', { name: customer.name }) : t('sales.customers.newCustomer')}
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
              <SectionCard title={t('sales.customers.sections.basic')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {textField('name', t('sales.customers.name'))}
                  {textField('code', t('sales.customers.code'), { placeholder: t('common.autoCodePlaceholder') })}
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
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2 space-y-0 sm:mt-8">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="!mt-0">{t('common.active')}</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              </SectionCard>

              <SectionCard title={t('sales.customers.sections.contact')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {textField('contactPerson', t('sales.customers.contactPerson'))}
                  {textField('phone', t('sales.customers.phone'), { dir: 'ltr' })}
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('sales.customers.email')}</FormLabel>
                        <FormControl>
                          <Input type="email" dir="ltr" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {textField('address', t('sales.customers.address'))}
                </div>
              </SectionCard>

              <SectionCard title={t('sales.customers.sections.financial')}>
                <div className="grid gap-4 sm:grid-cols-2">
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
                    name="creditLimitMinorUnits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('sales.customers.creditLimit')}</FormLabel>
                        <FormControl>
                          <CreditLimitInput value={field.value ?? null} onChange={field.onChange} />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">{t('sales.customers.creditLimitHint')}</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="priceListId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('priceLists.customerDefault')}</FormLabel>
                        <FormControl>
                          <PriceListSelect
                            value={field.value ?? null}
                            onChange={field.onChange}
                            currency={form.watch('defaultCurrency') ?? ''}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">{t('priceLists.customerDefaultHint')}</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="salesRepId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('salesReps.customerDefault')}</FormLabel>
                        <FormControl>
                          <SalesRepSelect value={field.value ?? null} onChange={field.onChange} />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">{t('salesReps.customerDefaultHint')}</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {textField('taxNumber', t('sales.customers.taxNumber'))}
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
                </div>
              </SectionCard>

              <SectionCard title={t('sales.customers.sections.other')}>
                <div className="grid gap-4">
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('sales.customers.notes')}</FormLabel>
                        <FormControl>
                          <Textarea rows={3} {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {definitions && definitions.length > 0 ? (
                    <div className="grid gap-2">
                      <p className="text-sm font-medium text-muted-foreground">{t('sales.customers.customFields')}</p>
                      <CustomFieldsFormSection definitions={definitions} />
                    </div>
                  ) : null}
                </div>
              </SectionCard>
            </>
          }
        />
      </form>
    </Form>
  );
}

/** Credit limit in the customer's currency: the user types a decimal, the form holds minor units ('' = unlimited). */
function CreditLimitInput({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => (value === null ? '' : minorUnitsToDecimalString(value)));
  const [invalid, setInvalid] = useState(false);
  return (
    <>
      <Input
        dir="ltr"
        inputMode="decimal"
        value={text}
        placeholder={t('sales.customers.creditLimitUnlimited')}
        aria-invalid={invalid}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (next.trim() === '') {
            setInvalid(false);
            onChange(null);
            return;
          }
          try {
            const minor = decimalToMinorUnits(next);
            const ok = BigInt(minor) >= 0n;
            setInvalid(!ok);
            // An invalid entry is passed through as-is so the schema rejects the save.
            onChange(ok ? minor : next);
          } catch {
            setInvalid(true);
            onChange(next);
          }
        }}
      />
      {invalid ? <p className="text-xs text-destructive">{t('sales.customers.creditLimitInvalid')}</p> : null}
    </>
  );
}
