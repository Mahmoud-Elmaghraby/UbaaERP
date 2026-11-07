import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createSupplierSchema, type CreateSupplierDto, type SupplierDto } from '@erp-platform/contracts';
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
  Skeleton,
  Textarea,
  toast,
  useHasFeature,
} from '@erp-platform/ui';
import { FileQuestion } from 'lucide-react';

import { useCustomFieldDefinitions, useTenantSettings } from '../../../settings/queries';
import { useCreateSupplier, useSupplier, useUpdateSupplier } from '../../api/suppliers/queries';
import { ApiError } from '../../../../lib/api-client';
import { FEATURE_KEYS } from '../../../../lib/feature-keys';
import { useSaveShortcut } from '../../../../lib/use-save-shortcut';
import { WhenTaxesInUse } from '../../../../components/taxes/when-taxes-in-use';
import { TaxRuleSelect } from '../../../../components/document/tax-rule-select';
import { CurrencySelect } from '../../../../components/document/currency-select';
import { DocumentBody, DocumentHeaderBar, SectionCard } from '../../../../components/document/document-layout';
import { PriceListSelect } from '../../../sales/components/price-lists/price-list-select';
import { SUPPLIERS_PATH } from './supplier-paths';

const SUPPLIER_ENTITY_TYPE = 'supplier';

/** Optional text inputs: the form holds '' for "empty", the API gets null. */
const NULLABLE_TEXT_FIELDS = ['contactPerson', 'email', 'phone', 'address', 'taxNumber', 'notes'] as const;

/** /purchases/suppliers/new and /:id/edit — one form, two modes (mirrors the customer editor). */
export function SupplierEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: supplier, isLoading, isError } = useSupplier(id);
  const { isLoading: definitionsLoading } = useCustomFieldDefinitions(SUPPLIER_ENTITY_TYPE);

  if ((id && isLoading) || definitionsLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (id && (isError || !supplier)) {
    return <EmptyState icon={<FileQuestion />} title={t('purchases.suppliers.notFound')} />;
  }
  return <SupplierEditor supplier={id ? supplier : undefined} />;
}

function SupplierEditor({ supplier }: { supplier: SupplierDto | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mode = supplier ? 'edit' : 'create';
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const { data: definitions } = useCustomFieldDefinitions(SUPPLIER_ENTITY_TYPE);
  const { data: tenantSettings } = useTenantSettings();
  // Multi-currency off: a NEW supplier takes the tenant currency; an existing one keeps its own (read-only).
  const multiCurrencyEnabled = useHasFeature(FEATURE_KEYS.MULTI_CURRENCY);

  const formSchema = useMemo(() => {
    const staticSchema = createSupplierSchema
      .omit({ customFields: true })
      .extend({ email: z.union([z.literal(''), z.string().email()]).nullable().optional() });
    if (!definitions) return staticSchema;
    const customFields = buildCustomFieldsSchema(definitions);
    // Existing suppliers may predate a required custom field — editing must not be blocked by it.
    return staticSchema.extend({ customFields: mode === 'edit' ? customFields.partial() : customFields });
  }, [definitions, mode]);

  const form = useForm<CreateSupplierDto>({
    resolver: zodResolver(formSchema as z.ZodType<CreateSupplierDto>),
    defaultValues: {
      name: supplier?.name ?? '',
      code: supplier?.code ?? '',
      contactPerson: supplier?.contactPerson ?? '',
      email: supplier?.email ?? '',
      phone: supplier?.phone ?? '',
      address: supplier?.address ?? '',
      taxNumber: supplier?.taxNumber ?? '',
      withholdingTaxRuleId: supplier?.withholdingTaxRuleId ?? null,
      priceListId: supplier?.priceListId ?? null,
      defaultCurrency: supplier?.defaultCurrency ?? '',
      paymentTermsDays: supplier?.paymentTermsDays ?? null,
      notes: supplier?.notes ?? '',
      isActive: supplier?.isActive ?? true,
      customFields: supplier?.customFields ?? {},
    },
  });

  useEffect(() => {
    if (mode === 'create' && tenantSettings && (!multiCurrencyEnabled || !form.getValues('defaultCurrency'))) {
      form.setValue('defaultCurrency', tenantSettings.currencyCode);
    }
  }, [mode, multiCurrencyEnabled, tenantSettings, form]);

  const saving = createSupplier.isPending || updateSupplier.isPending;

  async function onSubmit(values: CreateSupplierDto) {
    const input: CreateSupplierDto = { ...values };
    for (const key of NULLABLE_TEXT_FIELDS) {
      const value = input[key];
      if (typeof value === 'string' && value.trim() === '') input[key] = null;
    }
    // Create: empty code → next automatic code. Edit: an emptied code keeps the current one.
    if (!input.code?.trim()) delete input.code;
    try {
      const saved = supplier
        ? await updateSupplier.mutateAsync({ id: supplier.id, input })
        : await createSupplier.mutateAsync(input);
      toast.success(t(supplier ? 'purchases.suppliers.updateSuccess' : 'purchases.suppliers.createSuccess'));
      navigate(`${SUPPLIERS_PATH}/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t(supplier ? 'purchases.suppliers.updateError' : 'purchases.suppliers.createError'),
      );
    }
  }

  useSaveShortcut(() => void form.handleSubmit(onSubmit)(), saving);

  const textField = (
    name: 'name' | 'code' | 'contactPerson' | 'phone' | 'address' | 'taxNumber',
    label: string,
    extra?: { placeholder?: string; dir?: 'ltr' },
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
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
          backTo={supplier ? `${SUPPLIERS_PATH}/${supplier.id}` : SUPPLIERS_PATH}
          backLabel={t('documents.back')}
          eyebrow={t('purchases.tabs.suppliers')}
          title={supplier ? t('purchases.suppliers.editTitle', { name: supplier.name }) : t('purchases.suppliers.newSupplier')}
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
              <SectionCard title={t('purchases.suppliers.sections.basic')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {textField('name', t('purchases.suppliers.name'))}
                  {textField('code', t('purchases.suppliers.code'), { placeholder: t('common.autoCodePlaceholder') })}
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
                </div>
              </SectionCard>
              <SectionCard title={t('purchases.suppliers.sections.contact')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {textField('contactPerson', t('purchases.suppliers.contactPerson'))}
                  {textField('phone', t('purchases.suppliers.phone'), { dir: 'ltr' })}
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('purchases.suppliers.email')}</FormLabel>
                        <FormControl>
                          <Input type="email" dir="ltr" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {textField('address', t('purchases.suppliers.address'))}
                </div>
              </SectionCard>
              <SectionCard title={t('purchases.suppliers.sections.financial')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="defaultCurrency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('purchases.suppliers.defaultCurrency')}</FormLabel>
                        <FormControl>
                          <CurrencySelect value={field.value} onChange={field.onChange} disabled={!multiCurrencyEnabled} />
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
                    name="priceListId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('priceLists.supplierDefault')}</FormLabel>
                        <FormControl>
                          <PriceListSelect
                            kind="purchase"
                            value={field.value ?? null}
                            onChange={field.onChange}
                            currency={form.watch('defaultCurrency') ?? ''}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">{t('priceLists.supplierDefaultHint')}</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {textField('taxNumber', t('purchases.suppliers.taxNumber'))}
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
                </div>
              </SectionCard>
              <SectionCard title={t('purchases.suppliers.sections.other')}>
                <div className="grid gap-4">
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('purchases.suppliers.notes')}</FormLabel>
                        <FormControl>
                          <Textarea rows={3} {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {definitions && definitions.length > 0 ? (
                    <CustomFieldsFormSection definitions={definitions} namePrefix="customFields" />
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
