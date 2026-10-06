import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import type { ProductVariantDto } from '@erp-platform/contracts';
import { Badge, Button, Input, Skeleton, toast } from '@erp-platform/ui';

import {
  useAddVariantBarcode,
  useDeleteVariantBarcode,
  useGenerateVariants,
  useVariantBarcodes,
} from '../../api/products/queries';
import { ApiError } from '../../../../lib/api-client';
import { toWesternDigits } from '../../../../lib/search-normalize';
import { AttributesInput } from './product-form-fields';

/** A barcode scanner ends with Enter — keep it from submitting the form. */
function swallowEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter') event.preventDefault();
}

/**
 * Variant matrix: values per attribute (e.g. sizes "S، M، L" and colours
 * "أحمر، أزرق") → every missing combination is created with its own SKU (and
 * barcode in auto mode). Re-running after adding a size only adds the new ones.
 */
export function GenerateVariantsForm({
  productId,
  attributeNames,
  onDone,
}: {
  productId: string;
  attributeNames: string[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const generate = useGenerateVariants(productId);
  const [values, setValues] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(attributeNames.map((name) => [name, []])),
  );
  const total = useMemo(
    () =>
      attributeNames.every((name) => (values[name] ?? []).length > 0)
        ? attributeNames.reduce((count, name) => count * (values[name] ?? []).length, 1)
        : 0,
    [attributeNames, values],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (total === 0) return;
    try {
      const created = await generate.mutateAsync({ options: values });
      toast.success(t('inventory.products.matrix.created', { count: created.length }));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t('inventory.products.matrix.hint')}</p>
      {attributeNames.map((name) => (
        <div key={name} className="grid gap-1.5">
          <label className="text-sm font-medium">{name}</label>
          <AttributesInput
            value={values[name]}
            onChange={(list) => setValues((prev) => ({ ...prev, [name]: list }))}
            placeholder={t('inventory.products.matrix.valuesPlaceholder')}
          />
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2 text-sm">
        <span className="text-muted-foreground">{t('inventory.products.matrix.combinations')}</span>
        <span className="tabular font-semibold">{total}</span>
      </div>
      <Button type="submit" disabled={generate.isPending || total === 0}>
        {t('inventory.products.matrix.generate')}
      </Button>
    </form>
  );
}

/**
 * Extra barcodes for one variant: an alternate code (manufacturer + internal)
 * or a pack/carton code where one scan adds N pieces.
 */
export function ExtraBarcodesForm({ productId, variant }: { productId: string; variant: ProductVariantDto }) {
  const { t } = useTranslation();
  const { data: barcodes, isLoading } = useVariantBarcodes(productId, variant.id);
  const add = useAddVariantBarcode(productId, variant.id);
  const remove = useDeleteVariantBarcode(productId, variant.id);
  const [barcode, setBarcode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [label, setLabel] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const qty = Number(toWesternDigits(quantity));
    if (!barcode.trim() || !(qty > 0)) {
      toast.error(t('inventory.products.barcodes.invalid'));
      return;
    }
    try {
      await add.mutateAsync({ barcode: barcode.trim(), quantity: qty, label: label.trim() || null });
      setBarcode('');
      setQuantity('1');
      setLabel('');
      toast.success(t('inventory.products.barcodes.added'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function onRemove(id: string) {
    try {
      await remove.mutateAsync(id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1 text-sm">
        <span className="text-muted-foreground">{t('inventory.products.barcodes.primary')}</span>
        <span className="font-medium" dir="ltr">
          {variant.barcode ?? '—'}
        </span>
      </div>
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (barcodes ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('inventory.products.barcodes.none')}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {(barcodes ?? []).map((extra) => (
            <li key={extra.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium" dir="ltr">
                {extra.barcode}
              </span>
              {extra.label ? <span className="text-muted-foreground">{extra.label}</span> : null}
              <Badge variant={extra.quantity === 1 ? 'neutral' : 'info'}>
                {t('inventory.products.barcodes.perScan', { count: extra.quantity })}
              </Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('common.delete')}
                onClick={() => onRemove(extra.id)}
                disabled={remove.isPending}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border bg-subtle p-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">{t('inventory.products.barcode')}</label>
            <Input
              dir="ltr"
              value={barcode}
              placeholder={t('inventory.products.barcodePlaceholder')}
              onKeyDown={swallowEnter}
              onChange={(e) => setBarcode(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">{t('inventory.products.barcodes.quantity')}</label>
            <Input inputMode="decimal" className="text-end" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('inventory.products.barcodes.label')}</label>
          <Input
            value={label}
            placeholder={t('inventory.products.barcodes.labelPlaceholder')}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t('inventory.products.barcodes.quantityHint')}</p>
        <Button type="submit" disabled={add.isPending}>
          {t('inventory.products.barcodes.add')}
        </Button>
      </form>
    </div>
  );
}
