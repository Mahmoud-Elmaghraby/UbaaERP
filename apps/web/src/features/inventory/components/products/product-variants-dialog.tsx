import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import {
  createProductVariantSchema,
  type CreateProductVariantDto,
  type ProductDto,
} from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';

import { useAddProductVariant, useProduct } from '../../api/products/queries';
import { ApiError } from '../../../../lib/api-client';

/**
 * Nested "variants" management for one product. The backend only exposes
 * list (via GET /products/:id) and create (POST /products/:id/variants) for
 * variants — no update/delete endpoint exists yet — so this dialog mirrors
 * that exactly rather than inventing operations the API doesn't support.
 */
export function ProductVariantsDialog({
  product,
  onClose,
}: {
  product: ProductDto | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: full, isLoading } = useProduct(product?.id);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Dialog open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('inventory.products.manageVariants')} — {product?.name}
          </DialogTitle>
        </DialogHeader>
        {product ? (
          <div className="grid gap-4">
            <div className="flex justify-end">
              <Can permission="inventory.manage">
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">{t('inventory.products.newVariant')}</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('inventory.products.newVariant')}</DialogTitle>
                    </DialogHeader>
                    <AddVariantForm
                      productId={product.id}
                      attributeNames={product.attributes}
                      onDone={() => setAddOpen(false)}
                    />
                  </DialogContent>
                </Dialog>
              </Can>
            </div>

            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('inventory.products.sku')}</TableHead>
                    <TableHead>{t('inventory.products.barcode')}</TableHead>
                    <TableHead>{t('inventory.products.attributes')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(full?.variants ?? []).map((variant) => (
                    <TableRow key={variant.id}>
                      <TableCell className="font-medium">{variant.sku}</TableCell>
                      <TableCell>{variant.barcode ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(variant.attributeValues).map(([key, value]) => (
                            <Badge key={key} variant="secondary">
                              {key}: {String(value)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant.isActive ? 'default' : 'secondary'}>
                          {variant.isActive ? t('common.active') : t('common.inactive')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(full?.variants ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                        {t('common.noResults')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AddVariantForm({
  productId,
  attributeNames,
  onDone,
}: {
  productId: string;
  attributeNames: string[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const addVariant = useAddProductVariant(productId);
  // attributeValues is kept as plain component state rather than react-hook-form
  // fields: the backend contract types it as a free-form Record<string, unknown>
  // keyed by whatever attribute names the parent product declares, so there is
  // no static field path to register with the resolver-typed form below.
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>(
    Object.fromEntries(attributeNames.map((name) => [name, ''])),
  );

  const form = useForm<CreateProductVariantDto>({
    resolver: zodResolver(createProductVariantSchema),
    defaultValues: { sku: '', barcode: '', attributeValues: {} },
  });

  async function onSubmit(values: CreateProductVariantDto) {
    try {
      await addVariant.mutateAsync({
        sku: values.sku,
        barcode: values.barcode || null,
        attributeValues,
      });
      toast.success(t('inventory.products.createVariantSuccess'));
      form.reset();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.products.createVariantError'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="sku"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.products.sku')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="barcode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.products.barcode')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {attributeNames.length > 0 ? (
          <div className="grid gap-3">
            <FormLabel>{t('inventory.products.attributes')}</FormLabel>
            {attributeNames.map((name) => (
              <div key={name} className="grid gap-1.5">
                <label className="text-sm text-muted-foreground">{name}</label>
                <Input
                  value={attributeValues[name] ?? ''}
                  onChange={(e) =>
                    setAttributeValues((prev) => ({ ...prev, [name]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        ) : null}
        <Button type="submit" disabled={addVariant.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
