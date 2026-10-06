import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ClipboardPaste, Download, RefreshCw, ScanLine, Trash2, Upload } from 'lucide-react';
import type {
  ProductVariantLookupDto,
  StockCountLineDto,
  StockCountWithLinesDto,
  UpsertStockCountLineDto,
} from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
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

import {
  useCancelStockCount,
  useDeleteStockCountLine,
  useLoadStockIntoCount,
  usePostStockCount,
  useRefreshStockCount,
  useStockCount,
  useUpsertStockCountLines,
} from '../../api/stock-counts/queries';
import { useWarehouses } from '../../api/warehouses/queries';
import { useVariantLookupMap, useVariantLookup } from '../../api/products/queries';
import { useInventorySettings } from '../../api/catalog/queries';
import { useTenantSettings } from '../../../settings/queries';
import { ProductVariantPicker } from '../../../../components/product/product-variant-picker';
import { resolveScan, variantDisplayName } from '../../../../components/product/variant-search';
import { ApiError } from '../../../../lib/api-client';
import { downloadCsv } from '../../../../lib/csv';
import { decimalToMinorUnits, formatAmount, minorUnitsToDecimalString } from '../../../../lib/money';
import { toWesternDigits } from '../../../../lib/search-normalize';
import { COUNT_STATUS_VARIANT, COUNTS_PATH } from './count-status';
import { PasteLinesDialog } from './paste-lines-dialog';

type LineFilter = 'all' | 'uncounted' | 'differences';

function parseQuantity(text: string): number | null {
  const value = Number(toWesternDigits(text).replace(/[٫,]/g, '.').trim());
  return text.trim() === '' || !Number.isFinite(value) || value < 0 ? null : value;
}

/** Stocktake or opening balance editor: scan/add/paste lines, edit counts, post. */
export function StockCountPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams<{ id: string }>();
  const { data: count, isLoading } = useStockCount(id);
  const { data: warehouses } = useWarehouses();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!count) return <EmptyState title={t('documents.notFound')} />;
  const warehouseName = warehouses?.find((warehouse) => warehouse.id === count.warehouseId)?.name ?? '—';
  return <StockCountEditor count={count} warehouseName={warehouseName} />;
}

function StockCountEditor({ count, warehouseName }: { count: StockCountWithLinesDto; warehouseName: string }) {
  const { t } = useTranslation();
  const variants = useVariantLookupMap();
  const { data: variantList } = useVariantLookup();
  const { data: inventorySettings } = useInventorySettings();
  const { data: tenantSettings } = useTenantSettings();
  const currency = tenantSettings?.currencyCode ?? 'EGP';
  const isDraft = count.status === 'draft';
  const isOpening = count.kind === 'opening';

  const upsert = useUpsertStockCountLines(count.id);
  const removeLine = useDeleteStockCountLine(count.id);
  const loadStock = useLoadStockIntoCount(count.id);
  const refresh = useRefreshStockCount(count.id);
  const post = usePostStockCount(count.id);
  const cancel = useCancelStockCount(count.id);

  const [filter, setFilter] = useState<LineFilter>('all');
  const [search, setSearch] = useState('');
  const [scan, setScan] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  async function save(lines: UpsertStockCountLineDto[]) {
    try {
      await upsert.mutateAsync(lines);
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.counts.saveError'));
      return false;
    }
  }

  function lineInput(line: StockCountLineDto, patch: Partial<UpsertStockCountLineDto>): UpsertStockCountLineDto {
    return {
      productVariantId: line.productVariantId,
      locationId: line.locationId,
      lotNumber: line.lotNumber,
      expiryDate: line.expiryDate,
      countedQuantity: line.countedQuantity,
      unitCost: line.unitCost,
      ...patch,
    };
  }

  /** Scanner flow: each scan adds its quantity (1, a carton's 12, or a scale weight) to the item's line. */
  async function onScan() {
    const code = scan.trim();
    if (!code) return;
    const result = resolveScan(variantList ?? [], code, inventorySettings);
    if (!result) {
      toast.error(t('inventory.counts.scanNotFound', { code }));
      return;
    }
    if (result.variant.trackingType !== 'none') {
      toast.error(t('inventory.counts.scanTracked'));
      return;
    }
    const existing = count.lines.find((line) => line.productVariantId === result.variant.id && !line.lotNumber);
    const counted = Math.round(((existing?.countedQuantity ?? 0) + result.quantity) * 10_000) / 10_000;
    const ok = await save([
      existing
        ? lineInput(existing, { countedQuantity: counted })
        : { productVariantId: result.variant.id, countedQuantity: counted, unitCost: defaultCost(result.variant) },
    ]);
    if (ok) {
      setScan('');
      scanRef.current?.focus();
    }
  }

  function defaultCost(variant: ProductVariantLookupDto | undefined) {
    if (!isOpening || !variant?.purchasePrice || variant.purchasePrice.currency !== currency) return null;
    return variant.purchasePrice;
  }

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return count.lines.filter((line) => {
      if (filter === 'uncounted' && line.countedQuantity !== null) return false;
      if (filter === 'differences' && (line.countedQuantity === null || line.countedQuantity === line.systemQuantity))
        return false;
      if (!needle) return true;
      const variant = variants.get(line.productVariantId);
      return [variant ? variantDisplayName(variant) : '', variant?.sku, variant?.barcode, line.lotNumber]
        .filter(Boolean)
        .some((text) => String(text).toLowerCase().includes(needle));
    });
  }, [count.lines, filter, search, variants]);

  const counted = count.lines.filter((line) => line.countedQuantity !== null);
  const withDifference = counted.filter((line) => line.countedQuantity !== line.systemQuantity);
  const openingValue = isOpening
    ? counted.reduce(
        (sum, line) =>
          sum +
          (line.unitCost
            ? BigInt(line.unitCost.amountMinorUnits) * BigInt(Math.round(line.countedQuantity! * 10_000))
            : 0n),
        0n,
      ) / 10_000n
    : 0n;

  async function onPost() {
    if (
      !window.confirm(
        isOpening
          ? t('inventory.counts.postOpeningConfirm')
          : t('inventory.counts.postConfirm', { count: counted.length }),
      )
    )
      return;
    try {
      await post.mutateAsync();
      toast.success(t('inventory.counts.posted'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.counts.postError'));
    }
  }

  async function run(action: () => Promise<unknown>, success?: string) {
    try {
      await action();
      if (success) toast.success(success);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.counts.saveError'));
    }
  }

  function exportCsv() {
    downloadCsv(
      count.countNumber,
      [
        t('inventory.counts.csv.code'),
        t('inventory.counts.csv.product'),
        t('lots.lotNumber'),
        t('lots.expiryDate'),
        ...(isOpening ? [] : [t('inventory.counts.system')]),
        t('inventory.counts.counted'),
        ...(isOpening ? [t('inventory.counts.unitCost')] : [t('inventory.counts.difference')]),
      ],
      count.lines.map((line) => {
        const variant = variants.get(line.productVariantId);
        return [
          variant?.sku ?? '',
          variant ? variantDisplayName(variant) : '',
          line.lotNumber,
          line.expiryDate,
          ...(isOpening ? [] : [line.systemQuantity]),
          line.countedQuantity,
          ...(isOpening
            ? [line.unitCost ? minorUnitsToDecimalString(line.unitCost.amountMinorUnits) : '']
            : [line.countedQuantity === null ? '' : line.countedQuantity - line.systemQuantity]),
        ];
      }),
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <Link
            to={`${COUNTS_PATH}?kind=${count.kind}`}
            className="flex items-center gap-1 text-sm text-muted-foreground"
          >
            <ArrowRight className="size-4" />
            {t('documents.back')}
          </Link>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {count.countNumber}
            <Badge variant={COUNT_STATUS_VARIANT[count.status]} dot>
              {t(`inventory.counts.statuses.${count.status}`)}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(`inventory.counts.kinds.${count.kind}`)} · {warehouseName}
            {count.countDate ? ` · ${count.countDate}` : ''}
            {count.notes ? ` · ${count.notes}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={count.lines.length === 0}>
            <Download />
            {t('inventory.counts.exportCsv')}
          </Button>
          {isDraft ? (
            <>
              {!isOpening ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => run(() => loadStock.mutateAsync({}), t('inventory.counts.loaded'))}
                    disabled={loadStock.isPending}
                  >
                    <Upload />
                    {t('inventory.counts.loadStock')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => run(() => refresh.mutateAsync(undefined))}
                    disabled={refresh.isPending}
                  >
                    <RefreshCw />
                    {t('inventory.counts.refresh')}
                  </Button>
                </>
              ) : null}
              <Button variant="outline" onClick={() => setPasteOpen(true)}>
                <ClipboardPaste />
                {t('inventory.counts.paste')}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  window.confirm(t('inventory.counts.cancelConfirm')) && run(() => cancel.mutateAsync(undefined))
                }
              >
                {t('inventory.counts.cancel')}
              </Button>
              <Button onClick={onPost} disabled={post.isPending || counted.length === 0}>
                {t('inventory.counts.post')}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={t('inventory.counts.stats.lines')} value={count.lines.length} />
        <Stat label={t('inventory.counts.stats.counted')} value={counted.length} />
        {isOpening ? (
          <Stat label={t('inventory.counts.stats.openingValue')} value={formatAmount(openingValue.toString())} />
        ) : (
          <>
            <Stat label={t('inventory.counts.stats.uncounted')} value={count.lines.length - counted.length} />
            <Stat label={t('inventory.counts.stats.differences')} value={withDifference.length} tone="warning" />
          </>
        )}
      </div>

      {isDraft ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('inventory.counts.addTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-2">
              <ScanLine className="size-5 text-muted-foreground" />
              <Input
                ref={scanRef}
                dir="ltr"
                className="max-w-md"
                placeholder={t('inventory.counts.scanPlaceholder')}
                aria-label={t('inventory.counts.scanPlaceholder')}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void onScan();
                  }
                }}
              />
              <span className="text-xs text-muted-foreground">{t('inventory.counts.scanHint')}</span>
            </div>
            <AddLineForm
              isOpening={isOpening}
              currency={currency}
              busy={upsert.isPending}
              defaultCost={defaultCost}
              onAdd={(line) => save([line])}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="grid gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'uncounted', 'differences'] as const)
              .filter((option) => !isOpening || option === 'all')
              .map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={filter === option ? 'secondary' : 'ghost'}
                  onClick={() => setFilter(option)}
                >
                  {t(`inventory.counts.filters.${option}`)}
                </Button>
              ))}
            <Input
              className="ms-auto h-8 max-w-xs"
              placeholder={t('inventory.counts.searchLines')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {count.lines.length === 0 ? (
            <EmptyState
              className="py-10"
              title={isOpening ? t('inventory.counts.noLinesOpening') : t('inventory.counts.noLinesStocktake')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inventory.counts.csv.product')}</TableHead>
                  <TableHead>{t('lots.lotNumber')}</TableHead>
                  {!isOpening ? <TableHead className="w-24 text-end">{t('inventory.counts.system')}</TableHead> : null}
                  <TableHead className="w-32">{t('inventory.counts.counted')}</TableHead>
                  {!isOpening ? (
                    <TableHead className="w-24 text-end">{t('inventory.counts.difference')}</TableHead>
                  ) : null}
                  <TableHead className="w-36">{t('inventory.counts.unitCost')}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((line) => (
                  <CountLineRow
                    key={line.id}
                    line={line}
                    variant={variants.get(line.productVariantId)}
                    isOpening={isOpening}
                    editable={isDraft}
                    currency={currency}
                    onSave={(patch) => save([lineInput(line, patch)])}
                    onDelete={() => run(() => removeLine.mutateAsync(line.id))}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PasteLinesDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        isOpening={isOpening}
        currency={currency}
        onImport={(lines) => save(lines)}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'warning' }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={tone === 'warning' && value !== 0 ? 'text-xl font-semibold text-warning' : 'text-xl font-semibold'}
      >
        {value}
      </div>
    </div>
  );
}

function costText(line: StockCountLineDto): string {
  return line.unitCost ? minorUnitsToDecimalString(line.unitCost.amountMinorUnits) : '';
}

function CountLineRow({
  line,
  variant,
  isOpening,
  editable,
  currency,
  onSave,
  onDelete,
}: {
  line: StockCountLineDto;
  variant: ProductVariantLookupDto | undefined;
  isOpening: boolean;
  editable: boolean;
  currency: string;
  onSave: (patch: Partial<UpsertStockCountLineDto>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [quantity, setQuantity] = useState(line.countedQuantity === null ? '' : String(line.countedQuantity));
  const [cost, setCost] = useState(costText(line));
  const [syncedFrom, setSyncedFrom] = useState(line);
  // Server updates (a scan, a paste) replace the row's text.
  if (syncedFrom !== line) {
    setSyncedFrom(line);
    setQuantity(line.countedQuantity === null ? '' : String(line.countedQuantity));
    setCost(costText(line));
  }

  const difference =
    line.countedQuantity === null ? null : Math.round((line.countedQuantity - line.systemQuantity) * 10_000) / 10_000;

  function commitQuantity() {
    const parsed = parseQuantity(quantity);
    if (quantity.trim() !== '' && parsed === null) {
      toast.error(t('inventory.counts.invalidQuantity'));
      return;
    }
    if (parsed !== line.countedQuantity) void onSave({ countedQuantity: parsed });
  }

  function commitCost() {
    if (cost === costText(line)) return;
    if (cost.trim() === '') {
      void onSave({ unitCost: null });
      return;
    }
    try {
      void onSave({ unitCost: { amountMinorUnits: decimalToMinorUnits(toWesternDigits(cost)), currency } });
    } catch {
      toast.error(t('inventory.counts.invalidCost'));
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{variant ? variantDisplayName(variant) : line.productVariantId}</div>
        <div className="text-xs text-muted-foreground" dir="ltr">
          {variant?.sku}
        </div>
      </TableCell>
      <TableCell>
        {line.lotNumber ? (
          <div>
            <span dir="ltr" className="font-mono text-sm">
              {line.lotNumber}
            </span>
            {line.expiryDate ? (
              <div className="text-xs text-muted-foreground">
                {t('lots.expiresOn')} <bdi dir="ltr">{line.expiryDate}</bdi>
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      {!isOpening ? <TableCell className="text-end">{line.systemQuantity}</TableCell> : null}
      <TableCell>
        {editable ? (
          <Input
            className="h-8 text-end"
            inputMode="decimal"
            aria-label={t('inventory.counts.counted')}
            placeholder="—"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onBlur={commitQuantity}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          />
        ) : (
          <span>{line.countedQuantity ?? '—'}</span>
        )}
      </TableCell>
      {!isOpening ? (
        <TableCell
          className={
            difference === null || difference === 0
              ? 'text-end text-muted-foreground'
              : difference > 0
                ? 'text-end font-medium text-emerald-600'
                : 'text-end font-medium text-destructive'
          }
        >
          {difference === null ? '—' : <bdi dir="ltr">{difference > 0 ? `+${difference}` : difference}</bdi>}
        </TableCell>
      ) : null}
      <TableCell>
        {editable ? (
          <Input
            className="h-8 text-end"
            inputMode="decimal"
            aria-label={t('inventory.counts.unitCost')}
            placeholder={isOpening ? t('inventory.counts.required') : t('inventory.counts.averageCost')}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            onBlur={commitCost}
          />
        ) : (
          <span>{line.unitCost ? formatAmount(line.unitCost.amountMinorUnits) : '—'}</span>
        )}
      </TableCell>
      <TableCell>
        {editable ? (
          <Button variant="ghost" size="icon-sm" aria-label={t('documents.removeLine')} onClick={onDelete}>
            <Trash2 />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function AddLineForm({
  isOpening,
  currency,
  busy,
  defaultCost,
  onAdd,
}: {
  isOpening: boolean;
  currency: string;
  busy: boolean;
  defaultCost: (variant: ProductVariantLookupDto | undefined) => { amountMinorUnits: string; currency: string } | null;
  onAdd: (line: UpsertStockCountLineDto) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [variant, setVariant] = useState<ProductVariantLookupDto | undefined>();
  const [lotNumber, setLotNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const tracked = variant ? variant.trackingType !== 'none' : false;

  async function add() {
    if (!variant) return;
    const counted = parseQuantity(quantity);
    if (counted === null) {
      toast.error(t('inventory.counts.invalidQuantity'));
      return;
    }
    if (tracked && !lotNumber.trim()) {
      toast.error(t('inventory.counts.lotRequired'));
      return;
    }
    let unitCost: UpsertStockCountLineDto['unitCost'] = null;
    if (cost.trim()) {
      try {
        unitCost = { amountMinorUnits: decimalToMinorUnits(toWesternDigits(cost)), currency };
      } catch {
        toast.error(t('inventory.counts.invalidCost'));
        return;
      }
    }
    const ok = await onAdd({
      productVariantId: variant.id,
      lotNumber: tracked ? toWesternDigits(lotNumber).trim() : null,
      expiryDate: tracked && expiryDate ? expiryDate : null,
      countedQuantity: counted,
      unitCost,
    });
    if (ok) {
      setLotNumber('');
      setExpiryDate('');
      setQuantity('');
    }
  }

  return (
    <div className="grid items-end gap-2 md:grid-cols-[minmax(14rem,2fr)_1fr_1fr_7rem_8rem_auto]">
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">{t('inventory.counts.csv.product')}</span>
        <ProductVariantPicker
          className="h-9"
          value={variant?.id}
          filter={(candidate) => candidate.itemType !== 'service'}
          onChange={(_, picked) => {
            setVariant(picked);
            const preset = defaultCost(picked);
            setCost(preset ? minorUnitsToDecimalString(preset.amountMinorUnits) : '');
          }}
        />
      </div>
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">{t('lots.lotNumber')}</span>
        <Input
          className="h-9"
          dir="ltr"
          disabled={!tracked}
          value={lotNumber}
          onChange={(e) => setLotNumber(e.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">{t('lots.expiryDate')}</span>
        <Input
          className="h-9"
          type="date"
          disabled={!tracked}
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">{t('inventory.counts.counted')}</span>
        <Input
          className="h-9 text-end"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
        />
      </div>
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">
          {t('inventory.counts.unitCost')}
          {isOpening ? '' : ` (${t('documents.optional')})`}
        </span>
        <Input className="h-9 text-end" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
      </div>
      <Button onClick={add} disabled={!variant || busy}>
        {t('documents.addLine')}
      </Button>
    </div>
  );
}
