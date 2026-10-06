import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createProductSchema,
  updateProductSchema,
  type CreateProductDto,
  type ProductDto,
  type UpdateProductDto,
} from '@erp-platform/contracts';
import {
  Button,
  buildCustomFieldsSchema,
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
  Textarea,
  toast,
} from '@erp-platform/ui';

import { AttachmentsPanel } from '../../../attachments/components/attachments-panel';
import { useCustomFieldDefinitions, useTenantSettings } from '../../../settings/queries';
import { useInventorySettings } from '../../api/catalog/queries';
import { ProductMasterDataFields, usePriceDrafts } from './product-master-data-fields';
import { useCreateProduct, useUpdateProduct } from '../../api/products/queries';
import { ApiError } from '../../../../lib/api-client';
import { AttributesInput, UnitOfMeasureField, TrackingTypeField } from './product-form-fields';

const PRODUCT_ENTITY_TYPE = 'product';

export function CreateProductForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createProduct = useCreateProduct();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(PRODUCT_ENTITY_TYPE);
  const { data: inventorySettings } = useInventorySettings();
  const { data: tenantSettings } = useTenantSettings();
  const currency = tenantSettings?.currencyCode ?? 'EGP';
  const autoCode = inventorySettings?.itemCodeMode === 'auto';
  const autoBarcode = inventorySettings?.barcodeMode === 'auto';
  const prices = usePriceDrafts();

  const formSchema = useMemo(() => {
    // The form keeps an empty code as '' (auto mode); the API schema wants it omitted.
    const staticSchema = createProductSchema.omit({ customFields: true }).extend({ code: z.string().trim().optional() });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<CreateProductDto>({
    resolver: zodResolver(formSchema as z.ZodType<CreateProductDto>),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      unitOfMeasureId: '',
      trackVariants: false,
      trackingType: 'none',
      attributes: [],
      isActive: true,
      customFields: {},
      defaultVariantSku: '',
      defaultVariantBarcode: '',
      itemType: 'stock',
      categoryId: null,
      brandId: null,
      taxRuleId: null,
    },
  });

  const trackVariants = form.watch('trackVariants');

  async function onSubmit(values: CreateProductDto) {
    if (!autoCode && !values.code?.trim()) {
      form.setError('code', { message: t('inventory.products.codeRequired') });
      return;
    }
    const resolvedPrices = prices.resolve(currency);
    if (resolvedPrices === 'invalid') {
      toast.error(t('inventory.products.invalidPrice'));
      return;
    }
    try {
      await createProduct.mutateAsync({
        ...values,
        ...resolvedPrices,
        code: values.code?.trim() || undefined,
        description: values.description || null,
        defaultVariantSku: values.trackVariants ? undefined : values.defaultVariantSku || undefined,
        defaultVariantBarcode: values.trackVariants ? undefined : values.defaultVariantBarcode || undefined,
        attributes: values.trackVariants ? values.attributes : [],
      });
      toast.success(t('inventory.products.createSuccess'));
      form.reset();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.products.createError'));
    }
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
                <FormLabel>
                  {t('inventory.products.code')}
                  {autoCode ? <span className="font-normal text-muted-foreground"> — {t('inventory.products.optional')}</span> : null}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ''}
                    dir="ltr"
                    placeholder={autoCode ? t('inventory.products.codeAutoPlaceholder') : undefined}
                  />
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
                <FormLabel>{t('inventory.products.name')}</FormLabel>
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
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.products.description')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <ProductMasterDataFields prices={prices} currency={currency} />
        <FormField
          control={form.control}
          name="unitOfMeasureId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.products.unit')}</FormLabel>
              <UnitOfMeasureField value={field.value} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="trackingType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.products.trackingType')}</FormLabel>
              <TrackingTypeField value={field.value ?? 'none'} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="trackVariants"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0">{t('inventory.products.trackVariants')}</FormLabel>
            </FormItem>
          )}
        />
        {trackVariants ? (
          <FormField
            control={form.control}
            name="attributes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('inventory.products.attributes')}</FormLabel>
                <FormControl>
                  <AttributesInput
                    placeholder={t('inventory.products.attributesPlaceholder')}
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        {!trackVariants ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="defaultVariantSku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('inventory.products.defaultVariantSku')}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} dir="ltr" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="defaultVariantBarcode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('inventory.products.barcode')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      dir="ltr"
                      placeholder={
                        autoBarcode
                          ? t('inventory.products.barcodeAutoPlaceholder')
                          : t('inventory.products.barcodePlaceholder')
                      }
                      onKeyDown={(event) => {
                        // Barcode scanners end with Enter — don't let it submit the form.
                        if (event.key === 'Enter') event.preventDefault();
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
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
        {!definitionsLoading && definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}
        <Button type="submit" disabled={createProduct.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

export function EditProductForm({ product, onDone }: { product: ProductDto; onDone: () => void }) {
  const { t } = useTranslation();
  const updateProduct = useUpdateProduct();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(PRODUCT_ENTITY_TYPE);
  const { data: tenantSettings } = useTenantSettings();
  const currency = tenantSettings?.currencyCode ?? 'EGP';
  const prices = usePriceDrafts({ salePrice: product.salePrice, purchasePrice: product.purchasePrice });

  const formSchema = useMemo(() => {
    const staticSchema = updateProductSchema.omit({ customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions).partial() });
  }, [definitions]);

  const form = useForm<UpdateProductDto>({
    resolver: zodResolver(formSchema as z.ZodType<UpdateProductDto>),
    defaultValues: {
      code: product.code,
      name: product.name,
      description: product.description ?? '',
      unitOfMeasureId: product.unitOfMeasureId,
      trackVariants: product.trackVariants,
      trackingType: product.trackingType,
      attributes: product.attributes,
      isActive: product.isActive,
      customFields: product.customFields ?? {},
      itemType: product.itemType,
      categoryId: product.categoryId,
      brandId: product.brandId,
      taxRuleId: product.taxRuleId,
    },
  });

  const trackVariants = form.watch('trackVariants');

  async function onSubmit(values: UpdateProductDto) {
    const resolvedPrices = prices.resolve(product.salePrice?.currency ?? product.purchasePrice?.currency ?? currency);
    if (resolvedPrices === 'invalid') {
      toast.error(t('inventory.products.invalidPrice'));
      return;
    }
    try {
      await updateProduct.mutateAsync({
        id: product.id,
        input: { ...values, ...resolvedPrices, description: values.description || null },
      });
      toast.success(t('inventory.products.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.products.updateError'));
    }
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
                <FormLabel>{t('inventory.products.code')}</FormLabel>
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
                <FormLabel>{t('inventory.products.name')}</FormLabel>
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
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.products.description')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <ProductMasterDataFields prices={prices} currency={currency} />
        <FormField
          control={form.control}
          name="unitOfMeasureId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.products.unit')}</FormLabel>
              <UnitOfMeasureField value={field.value ?? ''} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="trackingType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.products.trackingType')}</FormLabel>
              <TrackingTypeField value={field.value ?? 'none'} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="trackVariants"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0">{t('inventory.products.trackVariants')}</FormLabel>
            </FormItem>
          )}
        />
        {trackVariants ? (
          <FormField
            control={form.control}
            name="attributes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('inventory.products.attributes')}</FormLabel>
                <FormControl>
                  <AttributesInput
                    placeholder={t('inventory.products.attributesPlaceholder')}
                    value={field.value}
                    onChange={field.onChange}
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
        {!definitionsLoading && definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}
        <Button type="submit" disabled={updateProduct.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>

      <AttachmentsPanel entityType="product" entityId={product.id} />
    </Form>
  );
}
