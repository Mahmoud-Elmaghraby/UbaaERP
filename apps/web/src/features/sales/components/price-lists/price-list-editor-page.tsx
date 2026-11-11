import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import type { PriceListCategoryRuleDto, PriceListKindDto, ProductVariantLookupDto, SavePriceListItemDto } from '@erp-platform/contracts';
import {
  Button,
  Can,
  Checkbox,
  Combobox,
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
import { useCategoryOptions } from '../../../inventory/api/catalog/queries';
import { downloadXlsx, readSpreadsheet } from '../../../../lib/xlsx';
import { exportSheet, parseSheet } from './price-list-excel';

type AdjustMode = 'discount' | 'markup';
interface RuleRow {
  key: string;
  categoryId: string;
  mode: AdjustMode;
  value: string;
}
/** "-12.5" → discount 12.5 · "15" → markup 15 · "0" → empty. */
const splitAdjust = (pct: string): { mode: AdjustMode; value: string } => {
  const n = Number(pct);
  if (!n) return { mode: 'discount', value: '' };
  return n < 0 ? { mode: 'discount', value: pct.replace(/^-/, '') } : { mode: 'markup', value: pct };
};
/** Back to a signed % ("" → "0"); null = not a number. */
const joinAdjust = (mode: AdjustMode, value: string): string | null => {
  const text = value.trim();
  if (!text) return '0';
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return mode === 'discount' && Number(text) > 0 ? `-${text}` : text;
};

/** "خصم / زيادة" + the %: one signed adjustment, read the way people say it. */
function AdjustInput({
  mode,
  value,
  onChange,
  maxDiscount = 100,
}: {
  mode: AdjustMode;
  value: string;
  onChange: (next: { mode: AdjustMode; value: string }) => void;
  maxDiscount?: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" className="flex shrink-0 rounded-md bg-muted p-0.5">
        {(['discount', 'markup'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => onChange({ mode: m, value })}
            className={`rounded px-2.5 py-1 text-xs font-medium ${mode === m ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
          >
            {t(`priceLists.adjust.${m}`)}
          </button>
        ))}
      </div>
      <Input
        inputMode="decimal"
        placeholder="0"
        className="w-24"
        max={mode === 'discount' ? maxDiscount : 1000}
        value={value}
        onChange={(e) => onChange({ mode, value: e.target.value })}
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
}

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

  const [header, setHeader] = useState({ name: '', currency: '', adjustMode: 'discount' as AdjustMode, adjustValue: '', isActive: true, notes: '' });
  const [rows, setRows] = useState<ItemRow[]>(() => [emptyRow()]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const { options: categoryOptions } = useCategoryOptions();
  const importInput = useRef<HTMLInputElement>(null);
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
    const adjust = splitAdjust(list.adjustPercent);
    setHeader({
      name: list.name,
      currency: list.currency,
      adjustMode: adjust.mode,
      adjustValue: adjust.value,
      isActive: list.isActive,
      notes: list.notes ?? '',
    });
    setRules(list.categoryRules.map((rule) => ({ key: newKey(), categoryId: rule.categoryId, ...splitAdjust(rule.adjustPercent) })));
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

  function buildRules(): PriceListCategoryRuleDto[] | null {
    const out: PriceListCategoryRuleDto[] = [];
    for (const rule of rules) {
      if (!rule.categoryId && !rule.value.trim()) continue;
      const pct = joinAdjust(rule.mode, rule.value);
      if (!rule.categoryId || pct === null || Number(pct) < -100 || Number(pct) > 1000) return null;
      out.push({ categoryId: rule.categoryId, adjustPercent: pct });
    }
    return out;
  }

  /** The sheet doubles as a template: every active variant, with the list's price where set. */
  function exportExcel() {
    const sheet = exportSheet(variants.values(), rows, (variant) => unitPriceText(variant, null, config.priceKind, header.currency));
    downloadXlsx(`${header.name || t('priceLists.title')}.xlsx`, sheet.header, sheet.body);
  }

  async function importExcel(file: File) {
    let sheet: string[][];
    try {
      sheet = await readSpreadsheet(file);
    } catch {
      toast.error(t('priceLists.excel.notSheet'));
      return;
    }
    const bySku = new Map([...variants.values()].map((v) => [v.sku.toLowerCase(), v]));
    const result = parseSheet(sheet, bySku);
    if (!result) {
      toast.error(t('priceLists.excel.badHeader'));
      return;
    }
    // Imported prices replace the variant rows they name; every other row stays as it was.
    const key = (variantId: string, min: string) => `${variantId}|${Number(min) || 0}`;
    const incoming = new Map(result.rows.map((r) => [key(r.variantId, r.minQuantity), r]));
    setRows((all) => {
      const kept = all.filter((row) => row.allVariants || !incoming.has(key(row.variantId, row.minQuantity)));
      const added = result.rows.map((r) => ({ key: newKey(), variantId: r.variantId, allVariants: false, minQuantity: r.minQuantity, price: r.price }));
      return [...kept.filter((row) => row.variantId || row.price.trim()), ...added];
    });
    toast.success(
      t('priceLists.excel.imported', { count: result.rows.length }) +
        (result.unknownSkus.length ? ` · ${t('priceLists.excel.unknown', { count: result.unknownSkus.length })}` : '') +
        (result.badPrices ? ` · ${t('priceLists.excel.bad', { count: result.badPrices })}` : ''),
    );
  }

  async function submit() {
    const items = buildItems();
    if (!items) {
      toast.error(t('priceLists.itemsError'));
      return;
    }
    const categoryRules = buildRules();
    const adjustPercent = joinAdjust(header.adjustMode, header.adjustValue);
    if (!categoryRules || adjustPercent === null || Number(adjustPercent) < -100 || Number(adjustPercent) > 1000) {
      toast.error(t('priceLists.adjust.invalid'));
      return;
    }
    try {
      const saved = await save.mutateAsync({
        id: isNew ? undefined : id,
        input: {
          name: header.name,
          currency: header.currency,
          adjustPercent,
          isActive: header.isActive,
          notes: header.notes.trim() || null,
          items,
          categoryRules,
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
                  <Label>{t('priceLists.adjust.label')}</Label>
                  <AdjustInput
                    mode={header.adjustMode}
                    value={header.adjustValue}
                    onChange={({ mode, value }) => setHeader({ ...header, adjustMode: mode, adjustValue: value })}
                  />
                  <p className="text-xs text-muted-foreground">{t('priceLists.adjust.hint')}</p>
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

            <SectionCard title={t('priceLists.categories.title')} description={t('priceLists.categories.hint')}>
              <div className="grid gap-2">
                {rules.map((rule) => (
                  <div key={rule.key} className="flex flex-wrap items-center gap-2">
                    <Combobox
                      className="h-9 w-72"
                      items={categoryOptions}
                      value={rule.categoryId}
                      getValue={(option) => option.id}
                      getLabel={(option) => option.path}
                      onValueChange={(categoryId) => setRules((all) => all.map((r) => (r.key === rule.key ? { ...r, categoryId } : r)))}
                      placeholder={t('priceLists.categories.pick')}
                    />
                    <AdjustInput
                      mode={rule.mode}
                      value={rule.value}
                      onChange={({ mode, value }) => setRules((all) => all.map((r) => (r.key === rule.key ? { ...r, mode, value } : r)))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('common.delete')}
                      onClick={() => setRules((all) => all.filter((r) => r.key !== rule.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRules((all) => [...all, { key: newKey(), categoryId: '', mode: 'discount', value: '' }])}
                  >
                    <Plus className="me-1 h-4 w-4" />
                    {t('priceLists.categories.add')}
                  </Button>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title={t('priceLists.items')}
              description={t('priceLists.itemsHint')}
              flush
              actions={
                <div className="flex items-center gap-2">
                  <Input
                    className="h-8 w-56"
                    placeholder={t('priceLists.searchItems')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={exportExcel}>
                    <Download className="me-1 h-4 w-4" />
                    {t('priceLists.excel.export')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => importInput.current?.click()}>
                    <Upload className="me-1 h-4 w-4" />
                    {t('priceLists.excel.import')}
                  </Button>
                  <input
                    ref={importInput}
                    type="file"
                    accept=".xlsx,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void importExcel(file);
                    }}
                  />
                </div>
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
