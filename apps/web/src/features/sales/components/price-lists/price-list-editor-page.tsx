import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { PriceListKindDto, ProductVariantLookupDto, SavePriceListItemDto } from '@erp-platform/contracts';
import {
  Button,
  Can,
  Checkbox,
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { DocumentBody, DocumentHeaderBar, SectionCard } from '../../../../components/document/document-layout';
import { CurrencySelect } from '../../../../components/document/currency-select';
import { ProductVariantPicker } from '../../../../components/product/product-variant-picker';
import { unitPriceText, variantDisplayName } from '../../../../components/product/variant-search';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { ApiError } from '../../../../lib/api-client';
import { normalizeForSearch } from '../../../../lib/search-normalize';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../../lib/money';
import { useVariantLookupMap } from '../../../inventory/api/products/queries';
import { useTenantSettings } from '../../../settings/queries';
import { useDeletePriceList, usePriceList, useSavePriceList } from '../../api/price-lists/queries';
import { PRICE_LIST_KINDS } from '../../api/price-lists/price-list-kind';

interface ItemRow {
  key: string;
  /** The picked variant; with allVariants it only names the product. */
  variantId: string;
  allVariants: boolean;
  minQuantity: string;
  price: string;
}

let keySeq = 0;
const newKey = () => `row-${++keySeq}`;
const emptyRow = (): ItemRow => ({ key: newKey(), variantId: '', allVariants: false, minQuantity: '', price: '' });

/** A price list (sales, or supplier with kind 'purchase'): header + its fixed prices (per product or per variant, with optional quantity breaks). */
export function PriceListEditorPage({ kind = 'sale' }: { kind?: PriceListKindDto }) {
  const config = PRICE_LIST_KINDS[kind];
  const listTitleKey = kind === 'purchase' ? 'priceLists.purchaseTitle' : 'priceLists.title';
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const { data: list, isLoading } = usePriceList(isNew ? undefined : id, kind);
  const { data: tenantSettings } = useTenantSettings();
  const variants = useVariantLookupMap();
  const save = useSavePriceList(kind);
  const remove = useDeletePriceList(kind);

  const [header, setHeader] = useState({ name: '', currency: '', discountPercent: '', isActive: true, notes: '' });
  const [rows, setRows] = useState<ItemRow[]>(() => [emptyRow()]);
  const [search, setSearch] = useState('');

  // Product id → its variants, to show "all sizes/colours" and to name a product-wide row.
  const variantsByProduct = useMemo(() => {
    const map = new Map<string, ProductVariantLookupDto[]>();
    for (const variant of variants.values()) {
      const all = map.get(variant.productId) ?? [];
      all.push(variant);
      map.set(variant.productId, all);
    }
    return map;
  }, [variants]);

  useEffect(() => {
    if (isNew && !header.currency && tenantSettings) setHeader((h) => ({ ...h, currency: tenantSettings.currencyCode }));
  }, [isNew, header.currency, tenantSettings]);

  // Load the saved list into the form once per list — a background refetch
  // (window focus, the save's own invalidation) must not wipe unsaved edits.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!list || loadedFor.current === list.id) return;
    // Product-wide rows are named through one of the product's variants.
    if (list.items.length > 0 && variants.size === 0) return;
    loadedFor.current = list.id;
    setHeader({
      name: list.name,
      currency: list.currency,
      discountPercent: Number(list.discountPercent) > 0 ? list.discountPercent : '',
      isActive: list.isActive,
      notes: list.notes ?? '',
    });
    setRows(
      list.items.map((item) => ({
        key: newKey(),
        variantId: item.productVariantId ?? variantsByProduct.get(item.productId)?.[0]?.id ?? '',
        allVariants: item.productVariantId === null,
        minQuantity: Number(item.minQuantity) > 0 ? item.minQuantity : '',
        price: minorUnitsToDecimalString(item.priceAmountMinorUnits),
      })),
    );
  }, [list, variants.size, variantsByProduct]);

  const update = (key: string, patch: Partial<ItemRow>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const needle = normalizeForSearch(search);
  const visible = needle
    ? rows.filter((row) => {
        const variant = variants.get(row.variantId);
        return variant ? normalizeForSearch(`${variantDisplayName(variant)} ${variant.sku}`).includes(needle) : true;
      })
    : rows;

  function buildItems(): SavePriceListItemDto[] | null {
    const items: SavePriceListItemDto[] = [];
    for (const row of rows) {
      if (!row.variantId && !row.price.trim()) continue; // an untouched empty row
      const variant = variants.get(row.variantId);
      if (!variant || !row.price.trim()) return null;
      let priceAmountMinorUnits: string;
      try {
        priceAmountMinorUnits = decimalToMinorUnits(row.price);
      } catch {
        return null;
      }
      const minQuantity = row.minQuantity.trim() === '' ? '0' : row.minQuantity.trim();
      if (!/^\d+(\.\d{1,3})?$/.test(minQuantity) || priceAmountMinorUnits.startsWith('-')) return null;
      items.push({
        productId: variant.productId,
        productVariantId: row.allVariants ? null : variant.id,
        minQuantity,
        priceAmountMinorUnits,
      });
    }
    return items;
  }

  async function submit() {
    const items = buildItems();
    if (!items) {
      toast.error(t('priceLists.itemsError'));
      return;
    }
    try {
      const saved = await save.mutateAsync({
        id: isNew ? undefined : id,
        input: {
          name: header.name,
          currency: header.currency,
          discountPercent: header.discountPercent.trim() || '0',
          isActive: header.isActive,
          notes: header.notes.trim() || null,
          items,
        },
      });
      toast.success(t('priceLists.saved'));
      if (isNew) navigate(`${config.path}/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function onDelete() {
    if (!id || !(await confirmDialog(t('priceLists.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await remove.mutateAsync(id);
      toast.success(t('priceLists.deleted'));
      navigate(config.path);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  if (!isNew && isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div>
      <DocumentHeaderBar
        backTo={config.path}
        backLabel={t(listTitleKey)}
        eyebrow={t(listTitleKey)}
        title={isNew ? t('priceLists.add') : header.name || list?.name}
        actions={
          <Can permission={config.permission}>
            {!isNew ? (
              <Button variant="outline" onClick={onDelete} disabled={remove.isPending}>
                {t('common.delete')}
              </Button>
            ) : null}
            <Button onClick={submit} disabled={save.isPending || !header.name.trim() || !header.currency}>
              {t('common.save')}
            </Button>
          </Can>
        }
      />
      <DocumentBody
        main={
          <>
            <SectionCard title={t('documents.info')}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label>{t('priceLists.name')}</Label>
                  <Input
                    value={header.name}
                    onChange={(e) => setHeader({ ...header, name: e.target.value })}
                    placeholder={t('priceLists.namePlaceholder')}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t('priceLists.currency')}</Label>
                  <CurrencySelect value={header.currency} onChange={(currency) => setHeader({ ...header, currency })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t('priceLists.discountPercent')}</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="0"
                    value={header.discountPercent}
                    onChange={(e) => setHeader({ ...header, discountPercent: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">{t('priceLists.discountHint')}</p>
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label>{t('priceLists.notes')}</Label>
                  <Textarea rows={2} value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 self-end text-sm">
                  <Checkbox checked={header.isActive} onCheckedChange={(v) => setHeader({ ...header, isActive: v === true })} />
                  {t('common.active')}
                </label>
              </div>
            </SectionCard>

            <SectionCard
              title={t('priceLists.items')}
              description={t('priceLists.itemsHint')}
              flush
              actions={
                <Input
                  className="h-8 w-56"
                  placeholder={t('priceLists.searchItems')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              }
            >
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('priceLists.item')}</TableHead>
                    <TableHead className="w-28">{t('priceLists.minQuantity')}</TableHead>
                    <TableHead className="w-36">{t('priceLists.price', { currency: header.currency })}</TableHead>
                    <TableHead className="w-32">{t('priceLists.normalPrice')}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => {
                    const variant = variants.get(row.variantId);
                    const siblings = variant ? (variantsByProduct.get(variant.productId)?.length ?? 1) : 1;
                    const normal = variant ? unitPriceText(variant, null, config.priceKind, header.currency) : null;
                    return (
                      <TableRow key={row.key}>
                        <TableCell>
                          <div className="grid gap-1 py-1">
                            <ProductVariantPicker
                              className="h-9"
                              value={row.variantId}
                              onChange={(variantId) => update(row.key, { variantId })}
                            />
                            {siblings > 1 ? (
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Checkbox
                                  checked={row.allVariants}
                                  onCheckedChange={(v) => update(row.key, { allVariants: v === true })}
                                />
                                {t('priceLists.allVariants', { count: siblings })}
                              </label>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            placeholder="1"
                            value={row.minQuantity}
                            onChange={(e) => update(row.key, { minQuantity: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            inputMode="decimal"
                            placeholder="0.00"
                            value={row.price}
                            onChange={(e) => update(row.key, { price: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="tabular text-muted-foreground">{normal ?? '—'}</TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t('common.delete')}
                            onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="px-5 py-3">
                <Button type="button" variant="outline" size="sm" onClick={() => setRows((all) => [...all, emptyRow()])}>
                  <Plus className="me-1 h-4 w-4" />
                  {t('priceLists.addItem')}
                </Button>
              </div>
            </SectionCard>
          </>
        }
      />
    </div>
  );
}
