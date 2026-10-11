import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import {
  createProductVariantSchema,
  type CreateProductVariantDto,
  type ProductDto,
  type ProductVariantDto,
  type MoneyDto,
} from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Checkbox,
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

import { useAddProductVariant, useProduct, useUpdateProductVariant } from '../../api/products/queries';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../../lib/money';
import { ExtraBarcodesForm, GenerateVariantsForm } from './variant-tools';
import { INV } from '../../../../lib/permissions';

/**
 * Nested variants management for one product: list, add, and edit (SKU,
 * barcode, option values, active) via PATCH /products/:id/variants/:variantId.
 * A simple (non-variant) product has exactly one variant here — this is where
 * its barcode is edited. Variants are deactivated, never deleted (stock and
 * documents reference them).
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
  const [editing, setEditing] = useState<ProductVariantDto | null>(null);
  const [barcodesFor, setBarcodesFor] = useState<ProductVariantDto | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);

  return (
    <Dialog open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('inventory.products.manageVariants')} — {product?.name}
          </DialogTitle>
        </DialogHeader>
        {product ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap justify-end gap-2">
              {product.attributes.length > 0 ? (
                <Can permission={INV.productsManage}>
                  <Button variant="outline" onClick={() => setMatrixOpen(true)}>
                    {t('inventory.products.matrix.open')}
                  </Button>
                </Can>
              ) : null}
              <Can permission={INV.productsManage}>
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild>
                    <Button>{t('inventory.products.newVariant')}</Button>
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

            {(full?.variants ?? []).length > 1 ? (
              <Can permission={INV.productsManage}>
                <UniformPriceBar productId={product.id} variants={full?.variants ?? []} productPrice={product.salePrice} />
              </Can>
            ) : null}
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('inventory.products.sku')}</TableHead>
                    <TableHead>{t('inventory.products.barcode')}</TableHead>
                    <TableHead>{t('inventory.products.attributes')}</TableHead>
                    <TableHead>{t('inventory.products.salePrice')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="w-40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(full?.variants ?? []).map((variant) => (
                    <TableRow key={variant.id}>
                      <TableCell className="font-medium" dir="ltr">
                        {variant.sku}
                      </TableCell>
                      <TableCell dir="ltr">{variant.barcode ?? '—'}</TableCell>
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
                        <VariantPriceCell productId={product.id} variant={variant} productPrice={product.salePrice} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant.isActive ? 'success' : 'neutral'} dot>
                          {variant.isActive ? t('common.active') : t('common.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Can permission={INV.productsManage}>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setBarcodesFor(variant)}>
                              {t('inventory.products.barcodes.manage')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditing(variant)}>
                              {t('common.edit')}
                            </Button>
                          </div>
                        </Can>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(full?.variants ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                        {t('common.noResults')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            )}
            <Dialog open={barcodesFor !== null} onOpenChange={(open) => !open && setBarcodesFor(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {t('inventory.products.barcodes.title')} — {barcodesFor?.sku}
                  </DialogTitle>
                </DialogHeader>
                {barcodesFor ? <ExtraBarcodesForm key={barcodesFor.id} productId={product.id} variant={barcodesFor} /> : null}
              </DialogContent>
            </Dialog>
            <Dialog open={matrixOpen} onOpenChange={setMatrixOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('inventory.products.matrix.title')}</DialogTitle>
                </DialogHeader>
                {matrixOpen ? (
                  <GenerateVariantsForm
                    productId={product.id}
                    attributeNames={product.attributes}
                    onDone={() => setMatrixOpen(false)}
                  />
                ) : null}
              </DialogContent>
            </Dialog>
            <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('inventory.products.editVariant')}</DialogTitle>
                </DialogHeader>
                {editing ? (
                  <EditVariantForm
                    key={editing.id}
                    productId={product.id}
                    variant={editing}
                    attributeNames={product.attributes}
                    onDone={() => setEditing(null)}
                  />
                ) : null}
              </DialogContent>
            </Dialog>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A variant's own sale price, edited in place (saved when leaving the
 * field). Empty = the product's price, shown as the placeholder.
 */
function VariantPriceCell({ productId, variant, productPrice }: { productId: string; variant: ProductVariantDto; productPrice: MoneyDto | null }) {
  const { t } = useTranslation();
  const update = useUpdateProductVariant(productId);
  const initial = variant.salePrice ? minorUnitsToDecimalString(variant.salePrice.amountMinorUnits) : '';
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial]);

  async function save() {
    if (text.trim() === initial) return;
    let salePrice: MoneyDto | null = null;
    if (text.trim()) {
      try {
        const minor = decimalToMinorUnits(text.trim());
        if (minor.startsWith('-')) throw new Error('negative');
        salePrice = { amountMinorUnits: minor, currency: productPrice?.currency ?? variant.salePrice?.currency ?? 'EGP' };
      } catch {
        toast.error(t('inventory.products.invalidPrice'));
        setText(initial);
        return;
      }
    }
    try {
      await update.mutateAsync({ variantId: variant.id, input: { salePrice } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
      setText(initial);
    }
  }

  return (
    <Input
      className="h-8 w-28 text-end"
      dir="ltr"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      placeholder={productPrice ? minorUnitsToDecimalString(productPrice.amountMinorUnits) : '—'}
      aria-label={t('inventory.products.salePrice')}
    />
  );
}

/** One price for every variant of the model, or every variant back to the product's price. */
function UniformPriceBar({ productId, variants, productPrice }: { productId: string; variants: ProductVariantDto[]; productPrice: MoneyDto | null }) {
  const { t } = useTranslation();
  const update = useUpdateProductVariant(productId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function apply(salePrice: MoneyDto | null) {
    setBusy(true);
    try {
      for (const variant of variants) await update.mutateAsync({ variantId: variant.id, input: { salePrice } });
      toast.success(t('inventory.products.options.pricesApplied'));
      setText('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  function applyTyped() {
    try {
      const minor = decimalToMinorUnits(text.trim());
      if (minor.startsWith('-')) throw new Error('negative');
      void apply({ amountMinorUnits: minor, currency: productPrice?.currency ?? variants[0]?.salePrice?.currency ?? 'EGP' });
    } catch {
      toast.error(t('inventory.products.invalidPrice'));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm">
      <span>{t('inventory.products.options.uniformPrice')}</span>
      <Input className="h-8 w-28 text-end" dir="ltr" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="0.00" />
      <Button size="sm" variant="outline" disabled={busy || !text.trim()} onClick={applyTyped}>
        {t('inventory.products.options.applyToAll')}
      </Button>
      <button type="button" className="text-xs text-primary hover:underline disabled:opacity-50" disabled={busy} onClick={() => void apply(null)}>
        {t('inventory.products.options.resetToProductPrice')}
      </button>
    </div>
  );
}

/** Prevents a barcode scanner's trailing Enter from submitting the surrounding form. */
function swallowEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter') event.preventDefault();
}

function EditVariantForm({
  productId,
  variant,
  attributeNames,
  onDone,
}: {
  productId: string;
  variant: ProductVariantDto;
  attributeNames: string[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const updateVariant = useUpdateProductVariant(productId);
  const [sku, setSku] = useState(variant.sku);
  const [barcode, setBarcode] = useState(variant.barcode ?? '');
  const [isActive, setIsActive] = useState(variant.isActive);
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      attributeNames.map((name) => [name, String(variant.attributeValues[name] ?? '')]),
    ),
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!sku.trim()) {
      toast.error(t('inventory.products.skuRequired'));
      return;
    }
    try {
      await updateVariant.mutateAsync({
        variantId: variant.id,
        input: {
          sku: sku.trim(),
          barcode: barcode.trim() === '' ? null : barcode.trim(),
          isActive,
          ...(attributeNames.length > 0 ? { attributeValues: { ...variant.attributeValues, ...attributeValues } } : {}),
        },
      });
      toast.success(t('inventory.products.updateVariantSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.products.updateVariantError'));
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{t('inventory.products.sku')}</label>
        <Input value={sku} dir="ltr" onChange={(e) => setSku(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{t('inventory.products.barcode')}</label>
        <Input
          value={barcode}
          dir="ltr"
          placeholder={t('inventory.products.barcodePlaceholder')}
          onKeyDown={swallowEnter}
          onChange={(e) => setBarcode(e.target.value)}
        />
      </div>
      {attributeNames.map((name) => (
        <div key={name} className="grid gap-1.5">
          <label className="text-sm text-muted-foreground">{name}</label>
          <Input
            value={attributeValues[name] ?? ''}
            onChange={(e) => setAttributeValues((prev) => ({ ...prev, [name]: e.target.value }))}
          />
        </div>
      ))}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
        {t('common.active')}
      </label>
      <Button type="submit" disabled={updateVariant.isPending} className="mt-2">
        {t('common.save')}
      </Button>
    </form>
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
        barcode: values.barcode ?? null,
        attributeValues,
      });
      toast.success(t('inventory.products.createVariantSuccess'));
      form.reset();
      onDone();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t('inventory.products.createVariantError'),
      );
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
                <Input
                  {...field}
                  value={field.value ?? ''}
                  dir="ltr"
                  placeholder={t('inventory.products.barcodePlaceholder')}
                  onKeyDown={swallowEnter}
                />
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
