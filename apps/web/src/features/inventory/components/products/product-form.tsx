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
import { useCustomFieldDefinitions } from '../../../settings/queries';
import { useCreateProduct, useUpdateProduct } from '../../api/products/queries';
import { ApiError } from '../../../../lib/api-client';
import { UnitOfMeasureField, TrackingTypeField } from './product-form-fields';

const PRODUCT_ENTITY_TYPE = 'product';

export function CreateProductForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createProduct = useCreateProduct();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(PRODUCT_ENTITY_TYPE);

  const formSchema = useMemo(() => {
    const staticSchema = createProductSchema.omit({ customFields: true });
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
    },
  });

  const trackVariants = form.watch('trackVariants');

  async function onSubmit(values: CreateProductDto) {
    try {
      await createProduct.mutateAsync({
        ...values,
        description: values.description || null,
        defaultVariantSku: values.defaultVariantSku || undefined,
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
                <FormLabel>{t('inventory.products.code')}</FormLabel>
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
                  <Input
                    placeholder={t('inventory.products.attributesPlaceholder')}
                    value={(field.value ?? []).join(', ')}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        <FormField
          control={form.control}
          name="defaultVariantSku"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.products.defaultVariantSku')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
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
    },
  });

  const trackVariants = form.watch('trackVariants');

  async function onSubmit(values: UpdateProductDto) {
    try {
      await updateProduct.mutateAsync({
        id: product.id,
        input: { ...values, description: values.description || null },
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
                  <Input
                    placeholder={t('inventory.products.attributesPlaceholder')}
                    value={(field.value ?? []).join(', ')}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      )
                    }
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
