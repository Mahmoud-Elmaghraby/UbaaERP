import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Printer } from 'lucide-react';
import type { CreateStockAdjustmentDto, StockAdjustmentWithLinesDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
  useHasAnyPermission,
} from '@erp-platform/ui';

import {
  useAdjustmentReasons,
  useCreateStockAdjustment,
  useDeleteStockAdjustment,
  useStockAdjustment,
  useStockAdjustmentAction,
  useUpdateStockAdjustment,
} from '../../api/stock-documents/queries';
import { useWarehouses } from '../../api/warehouses/queries';
import { useVariantLookupMap } from '../../api/products/queries';
import { useInventorySettings } from '../../api/catalog/queries';
import { useTenantSettings } from '../../../settings/queries';
import {
  StockLinesEditor,
  newStockLine,
  parseStockCost,
  parseStockQuantity,
  type StockLineDraft,
} from '../../../../components/document/stock-lines-editor';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { variantDisplayName } from '../../../../components/product/variant-search';
import { ApiError } from '../../../../lib/api-client';
import { formatMoney, minorUnitsToDecimalString, sumMinorUnits } from '../../../../lib/money';
import { INV } from '../../../../lib/permissions';
import { ADJUSTMENT_STATUS_VARIANT, ADJUSTMENTS_PATH } from '../../lib/document-status';

const NO_REASON = '__none__';

/** One stock adjustment (إذن إضافة / صرف): draft lines, then post. */
export function StockAdjustmentPage() {
  const { t } = useTranslation();
  const { id = 'new' } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { data: adjustment, isLoading } = useStockAdjustment(isNew ? undefined : id);
  if (!isNew && isLoading) return <Skeleton className="h-64 w-full" />;
  if (!isNew && !adjustment) return <EmptyState title={t('documents.notFound')} />;
  return <AdjustmentEditor key={adjustment?.id ?? 'new'} adjustment={adjustment ?? null} />;
}

function toDraftLines(adjustment: StockAdjustmentWithLinesDto | null): StockLineDraft[] {
  if (!adjustment || adjustment.lines.length === 0) return [newStockLine()];
  return adjustment.lines.map((line) =>
    newStockLine({
      productVariantId: line.productVariantId,
      unitOfMeasureId: line.unitOfMeasureId,
      quantity: String(line.quantity),
      direction: line.direction,
      unitCost: line.unitCost ? minorUnitsToDecimalString(line.unitCost.amountMinorUnits) : '',
      lotNumber: line.lotNumber ?? '',
      expiryDate: line.expiryDate ?? '',
      reasonId: line.reasonId,
      notes: line.notes ?? '',
    }),
  );
}

function AdjustmentEditor({ adjustment }: { adjustment: StockAdjustmentWithLinesDto | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: warehouses } = useWarehouses();
  const { data: reasons } = useAdjustmentReasons();
  const { data: tenantSettings } = useTenantSettings();
  const { data: inventorySettings } = useInventorySettings();
  const variants = useVariantLookupMap();
  const canManage = useHasAnyPermission([INV.movementsManage]);
  const showCost = useHasAnyPermission([INV.costsView]);
  const currency = tenantSettings?.currencyCode ?? 'EGP';
  const status = adjustment?.status ?? 'draft';
  const editable = status === 'draft' && canManage;
  const activeWarehouses = (warehouses ?? []).filter((warehouse) => warehouse.isActive);

  const [warehouseId, setWarehouseId] = useState(adjustment?.warehouseId ?? '');
  const [reasonId, setReasonId] = useState<string | null>(adjustment?.reasonId ?? null);
  const [date, setDate] = useState(adjustment?.adjustmentDate ?? new Date().toLocaleDateString('en-CA'));
  const [notes, setNotes] = useState(adjustment?.notes ?? '');
  const [lines, setLines] = useState<StockLineDraft[]>(() => toDraftLines(adjustment));

  useEffect(() => {
    if (!warehouseId && activeWarehouses.length > 0) setWarehouseId(activeWarehouses[0]!.id);
  }, [activeWarehouses, warehouseId]);

  const create = useCreateStockAdjustment();
  const update = useUpdateStockAdjustment(adjustment?.id ?? '');
  const action = useStockAdjustmentAction();
  const remove = useDeleteStockAdjustment();
  const busy = create.isPending || update.isPending || action.isPending;

  async function run<T>(work: () => Promise<T>, success?: string): Promise<T | null> {
    try {
      const result = await work();
      if (success) toast.success(success);
      return result;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
      return null;
    }
  }

  function buildInput(): Omit<CreateStockAdjustmentDto, 'post'> | null {
    if (!warehouseId) {
      toast.error(t('inventory.transfers.pickWarehouse'));
      return null;
    }
    const parsed = [];
    for (const line of lines.filter((candidate) => candidate.productVariantId)) {
      const quantity = parseStockQuantity(line.quantity);
      const cost = parseStockCost(line.unitCost);
      if (quantity === null) {
        toast.error(t('inventory.documents.invalidQuantity'));
        return null;
      }
      if (cost === undefined) {
        toast.error(t('inventory.documents.invalidCost'));
        return null;
      }
      parsed.push({
        productVariantId: line.productVariantId,
        direction: line.direction,
        quantity,
        unitOfMeasureId: line.unitOfMeasureId,
        unitCost: line.direction === 'increase' && cost ? { amountMinorUnits: cost, currency } : null,
        lotNumber: line.lotNumber.trim() || null,
        expiryDate: line.direction === 'increase' && line.expiryDate ? line.expiryDate : null,
        reasonId: line.reasonId,
        notes: line.notes.trim() || null,
      });
    }
    if (parsed.length === 0) {
      toast.error(t('inventory.documents.noLines'));
      return null;
    }
    return {
      warehouseId,
      reasonId,
      adjustmentDate: date || null,
      notes: notes.trim() || null,
      lines: parsed,
    };
  }

  async function save(post: boolean) {
    const input = buildInput();
    if (!input) return;
    if (post && !window.confirm(t('inventory.adjustments.postConfirm'))) return;
    if (!adjustment) {
      const created = await run(
        () => create.mutateAsync({ ...input, post }),
        post ? t('inventory.adjustments.posted') : t('inventory.documents.saved'),
      );
      if (created) navigate(`${ADJUSTMENTS_PATH}/${created.id}`, { replace: true });
      return;
    }
    const saved = await run(() => update.mutateAsync(input), post ? undefined : t('inventory.documents.saved'));
    if (saved && post) {
      await run(() => action.mutateAsync({ id: saved.id, action: 'post' }), t('inventory.adjustments.posted'));
    }
  }

  const reasonName = new Map((reasons ?? []).map((reason) => [reason.id, reason.name]));
  const warehouseName = warehouses?.find((warehouse) => warehouse.id === adjustment?.warehouseId)?.name ?? '—';
  const totalValue = adjustment
    ? sumMinorUnits(
        adjustment.lines.map((line) =>
          line.postedValue
            ? line.direction === 'increase'
              ? line.postedValue.amountMinorUnits
              : `-${line.postedValue.amountMinorUnits}`
            : '0',
        ),
      )
    : '0';

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <Link to={ADJUSTMENTS_PATH} className="flex items-center gap-1 text-sm text-muted-foreground print:hidden">
            <ArrowRight className="size-4" />
            {t('documents.back')}
          </Link>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {adjustment ? adjustment.adjustmentNumber : t('inventory.adjustments.new')}
            {adjustment ? (
              <Badge variant={ADJUSTMENT_STATUS_VARIANT[status]} dot>
                {t(`inventory.adjustments.statuses.${status}`)}
              </Badge>
            ) : null}
          </h1>
          {adjustment ? (
            <p className="text-sm text-muted-foreground">
              {warehouseName} · {adjustment.adjustmentDate}
              {adjustment.reasonId ? ` · ${reasonName.get(adjustment.reasonId) ?? ''}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {adjustment ? (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer />
              {t('inventory.documents.print')}
            </Button>
          ) : null}
          {editable ? (
            <>
              <Button variant="outline" onClick={() => save(false)} disabled={busy}>
                {t('inventory.documents.saveDraft')}
              </Button>
              <Button onClick={() => save(true)} disabled={busy}>
                {t('inventory.adjustments.post')}
              </Button>
            </>
          ) : null}
          {adjustment && editable ? (
            <>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  window.confirm(t('inventory.adjustments.cancelConfirm')) &&
                  run(() => action.mutateAsync({ id: adjustment.id, action: 'cancel' }))
                }
              >
                {t('inventory.adjustments.cancel')}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm(t('inventory.documents.deleteConfirm'))) return;
                  if (await run(() => remove.mutateAsync(adjustment.id))) navigate(ADJUSTMENTS_PATH);
                }}
              >
                {t('common.delete')}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {editable ? (
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-1.5">
              <Label>{t('documents.warehouse')}</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('inventory.transfers.pickWarehouse')} />
                </SelectTrigger>
                <SelectContent>
                  {activeWarehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t('inventory.documents.reason')}</Label>
              <Select value={reasonId ?? NO_REASON} onValueChange={(value) => setReasonId(value === NO_REASON ? null : value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_REASON}>{t('inventory.documents.noReason')}</SelectItem>
                  {(reasons ?? [])
                    .filter((reason) => reason.isActive || reason.id === reasonId)
                    .map((reason) => (
                      <SelectItem key={reason.id} value={reason.id}>
                        {reason.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t('inventory.transfers.date')}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t('documents.notes')}</Label>
              <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('inventory.documents.lines')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {editable ? (
            <StockLinesEditor
              lines={lines}
              onChange={setLines}
              showDirection
              showCost={showCost}
              reasons={reasons ?? []}
              currency={currency}
              scale={inventorySettings}
            />
          ) : adjustment ? (
            <div className="overflow-x-auto">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>{t('inventory.documents.item')}</TableHead>
                    <TableHead>{t('inventory.documents.direction')}</TableHead>
                    <TableHead className="text-end">{t('documents.quantity')}</TableHead>
                    <TableHead>{t('inventory.documents.reason')}</TableHead>
                    {showCost ? <TableHead className="text-end">{t('inventory.transfers.value')}</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustment.lines.map((line) => {
                    const variant = variants.get(line.productVariantId);
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="text-center text-muted-foreground">{line.lineNumber}</TableCell>
                        <TableCell>
                          <div className="font-medium">{variant ? variantDisplayName(variant) : '—'}</div>
                          {line.lotNumber ? (
                            <div className="text-xs text-muted-foreground" dir="ltr">
                              {line.lotNumber}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant={line.direction === 'increase' ? 'success' : 'warning'}>
                            {t(`inventory.documents.${line.direction}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end">
                          <QuantityWithUnit
                            quantity={line.quantity}
                            productVariantId={line.productVariantId}
                            unitOfMeasureId={line.unitOfMeasureId}
                          />
                        </TableCell>
                        <TableCell>
                          {reasonName.get(line.reasonId ?? adjustment.reasonId ?? '') ?? '—'}
                        </TableCell>
                        {showCost ? (
                          <TableCell className="text-end">
                            {line.postedValue
                              ? formatMoney(line.postedValue.amountMinorUnits, line.postedValue.currency)
                              : '—'}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {showCost && status === 'posted' ? (
                <div className="flex justify-end border-t px-5 py-3 text-sm">
                  <span className="text-muted-foreground">{t('inventory.adjustments.netValue')}:</span>
                  <span className="ms-2 font-semibold">{formatMoney(totalValue, currency)}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
