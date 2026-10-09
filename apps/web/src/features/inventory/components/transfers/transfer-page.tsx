import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Printer, Truck } from 'lucide-react';
import type { CreateStockTransferDto, StockTransferWithLinesDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  useCreateStockTransfer,
  useDeleteStockTransfer,
  useStockTransfer,
  useStockTransferAction,
  useUpdateStockTransfer,
} from '../../api/stock-documents/queries';
import { useWarehouseLocations, useWarehouses } from '../../api/warehouses/queries';
import { useVariantLookupMap } from '../../api/products/queries';
import { useInventorySettings } from '../../api/catalog/queries';
import { useTenantSettings } from '../../../settings/queries';
import {
  StockLinesEditor,
  newStockLine,
  parseStockQuantity,
  type StockLineDraft,
} from '../../../../components/document/stock-lines-editor';
import { QuantityWithUnit } from '../../../../components/product/unit-select';
import { variantDisplayName } from '../../../../components/product/variant-search';
import { ApiError } from '../../../../lib/api-client';
import { formatMoney } from '../../../../lib/money';
import { INV } from '../../../../lib/permissions';
import { TRANSFER_STATUS_VARIANT, TRANSFERS_PATH } from '../../lib/document-status';
import { PrintButton } from '../../../../components/printing/print-button';

interface HeaderDraft {
  fromWarehouseId: string;
  fromLocationId: string | null;
  toWarehouseId: string;
  toLocationId: string | null;
  transferDate: string;
  notes: string;
}

/** One transfer: create / edit a draft, then dispatch + receive (or post in one step). */
export function StockTransferPage() {
  const { t } = useTranslation();
  const { id = 'new' } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { data: transfer, isLoading } = useStockTransfer(isNew ? undefined : id);

  if (!isNew && isLoading) return <Skeleton className="h-64 w-full" />;
  if (!isNew && !transfer) return <EmptyState title={t('documents.notFound')} />;
  return <TransferEditor key={transfer?.id ?? 'new'} transfer={transfer ?? null} />;
}

function toDraftLines(transfer: StockTransferWithLinesDto | null): StockLineDraft[] {
  if (!transfer || transfer.lines.length === 0) return [newStockLine()];
  return transfer.lines.map((line) =>
    newStockLine({
      productVariantId: line.productVariantId,
      unitOfMeasureId: line.unitOfMeasureId,
      quantity: String(line.quantity),
      lotNumber: line.lots.length === 1 ? line.lots[0]!.lotNumber : '',
      notes: line.notes ?? '',
    }),
  );
}

function TransferEditor({ transfer }: { transfer: StockTransferWithLinesDto | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: warehouses } = useWarehouses();
  const { data: tenantSettings } = useTenantSettings();
  const { data: inventorySettings } = useInventorySettings();
  const variants = useVariantLookupMap();
  const canManage = useHasAnyPermission([INV.transfersManage]);
  const canApprove = useHasAnyPermission([INV.transfersApprove]);
  const currency = tenantSettings?.currencyCode ?? 'EGP';

  const status = transfer?.status ?? 'draft';
  const editable = status === 'draft' && canManage;
  const activeWarehouses = (warehouses ?? []).filter((warehouse) => warehouse.isActive);

  const [header, setHeader] = useState<HeaderDraft>(() => ({
    fromWarehouseId: transfer?.fromWarehouseId ?? '',
    fromLocationId: transfer?.fromLocationId ?? null,
    toWarehouseId: transfer?.toWarehouseId ?? '',
    toLocationId: transfer?.toLocationId ?? null,
    transferDate: transfer?.transferDate ?? new Date().toLocaleDateString('en-CA'),
    notes: transfer?.notes ?? '',
  }));
  const [lines, setLines] = useState<StockLineDraft[]>(() => toDraftLines(transfer));
  const [receiveOpen, setReceiveOpen] = useState(false);

  // Default the source to the first warehouse once they load.
  useEffect(() => {
    if (!header.fromWarehouseId && activeWarehouses.length > 0) {
      setHeader((current) => ({
        ...current,
        fromWarehouseId: activeWarehouses[0]!.id,
        toWarehouseId: current.toWarehouseId || activeWarehouses[1]?.id || '',
      }));
    }
  }, [activeWarehouses, header.fromWarehouseId]);

  const create = useCreateStockTransfer();
  const update = useUpdateStockTransfer(transfer?.id ?? '');
  const action = useStockTransferAction();
  const remove = useDeleteStockTransfer();
  const busy = create.isPending || update.isPending || action.isPending;

  const warehouseName = (id: string) => warehouses?.find((warehouse) => warehouse.id === id)?.name ?? '—';

  function buildInput(): CreateStockTransferDto | null {
    if (!header.fromWarehouseId || !header.toWarehouseId) {
      toast.error(t('inventory.transfers.pickWarehouses'));
      return null;
    }
    const parsed = [];
    for (const line of lines.filter((candidate) => candidate.productVariantId)) {
      const quantity = parseStockQuantity(line.quantity);
      if (quantity === null) {
        toast.error(t('inventory.documents.invalidQuantity'));
        return null;
      }
      parsed.push({
        productVariantId: line.productVariantId,
        quantity,
        unitOfMeasureId: line.unitOfMeasureId,
        lots: line.lotNumber.trim() ? [{ lotNumber: line.lotNumber.trim(), quantity }] : [],
        notes: line.notes.trim() || null,
      });
    }
    if (parsed.length === 0) {
      toast.error(t('inventory.documents.noLines'));
      return null;
    }
    return {
      fromWarehouseId: header.fromWarehouseId,
      fromLocationId: header.fromLocationId,
      toWarehouseId: header.toWarehouseId,
      toLocationId: header.toLocationId,
      transferDate: header.transferDate || null,
      notes: header.notes.trim() || null,
      lines: parsed,
    };
  }

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

  /** Saves the draft (creating it the first time), then optionally runs a step on it. */
  async function save(then?: 'dispatch' | 'post') {
    const input = buildInput();
    if (!input) return;
    const saved = await run(() => (transfer ? update.mutateAsync(input) : create.mutateAsync(input)));
    if (!saved) return;
    if (!transfer) navigate(`${TRANSFERS_PATH}/${saved.id}`, { replace: true });
    if (!then) {
      toast.success(t('inventory.documents.saved'));
      return;
    }
    const confirmText = then === 'post' ? t('inventory.transfers.postConfirm') : t('inventory.transfers.dispatchConfirm');
    if (!window.confirm(confirmText)) return;
    await run(
      () => action.mutateAsync({ id: saved.id, action: then }),
      then === 'post' ? t('inventory.transfers.posted') : t('inventory.transfers.dispatched'),
    );
  }

  const routeFields = (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <WarehouseField
        label={t('inventory.transfers.from')}
        warehouses={activeWarehouses}
        warehouseId={header.fromWarehouseId}
        locationId={header.fromLocationId}
        disabled={!editable}
        onChange={(fromWarehouseId, fromLocationId) => setHeader({ ...header, fromWarehouseId, fromLocationId })}
      />
      <WarehouseField
        label={t('inventory.transfers.to')}
        warehouses={activeWarehouses}
        warehouseId={header.toWarehouseId}
        locationId={header.toLocationId}
        disabled={!editable}
        onChange={(toWarehouseId, toLocationId) => setHeader({ ...header, toWarehouseId, toLocationId })}
      />
      <div className="grid gap-1.5">
        <Label>{t('inventory.transfers.date')}</Label>
        <Input
          type="date"
          value={header.transferDate}
          disabled={!editable}
          onChange={(e) => setHeader({ ...header, transferDate: e.target.value })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>{t('documents.notes')}</Label>
        <Textarea
          rows={1}
          value={header.notes}
          disabled={!editable}
          onChange={(e) => setHeader({ ...header, notes: e.target.value })}
        />
      </div>
    </div>
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <Link to={TRANSFERS_PATH} className="flex items-center gap-1 text-sm text-muted-foreground print:hidden">
            <ArrowRight className="size-4" />
            {t('documents.back')}
          </Link>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {transfer ? transfer.transferNumber : t('inventory.transfers.new')}
            {transfer ? (
              <Badge variant={TRANSFER_STATUS_VARIANT[status]} dot>
                {t(`inventory.transfers.statuses.${status}`)}
              </Badge>
            ) : null}
            {transfer ? <PrintButton documentType="stock_transfer" id={transfer.id} /> : null}
          </h1>
          {transfer ? (
            <p className="text-sm text-muted-foreground">
              {warehouseName(transfer.fromWarehouseId)} ← {warehouseName(transfer.toWarehouseId)} ·{' '}
              {transfer.transferDate}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {transfer ? (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer />
              {t('inventory.documents.print')}
            </Button>
          ) : null}
          {editable ? (
            <>
              <Button variant="outline" onClick={() => save()} disabled={busy}>
                {t('inventory.documents.saveDraft')}
              </Button>
              {canApprove ? (
                <>
                  <Button variant="outline" onClick={() => save('dispatch')} disabled={busy}>
                    <Truck />
                    {t('inventory.transfers.dispatch')}
                  </Button>
                  <Button onClick={() => save('post')} disabled={busy}>
                    {t('inventory.transfers.post')}
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
          {transfer && status === 'draft' && canManage ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm(t('inventory.documents.deleteConfirm'))) return;
                if (await run(() => remove.mutateAsync(transfer.id))) navigate(TRANSFERS_PATH);
              }}
            >
              {t('common.delete')}
            </Button>
          ) : null}
          {transfer && status === 'in_transit' ? (
            <Can permission={INV.transfersApprove}>
              <Button onClick={() => setReceiveOpen(true)} disabled={busy}>
                {t('inventory.transfers.receive')}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  window.confirm(t('inventory.transfers.cancelTransitConfirm')) &&
                  run(() => action.mutateAsync({ id: transfer.id, action: 'cancel' }), t('inventory.transfers.cancelled'))
                }
              >
                {t('inventory.transfers.cancel')}
              </Button>
            </Can>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">{routeFields}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('inventory.documents.lines')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {editable ? (
            <StockLinesEditor
              lines={lines}
              onChange={setLines}
              currency={currency}
              scale={inventorySettings}
            />
          ) : transfer ? (
            <TransferLinesView transfer={transfer} variants={variants} />
          ) : null}
        </CardContent>
      </Card>

      {transfer && status === 'in_transit' ? (
        <ReceiveDialog
          transfer={transfer}
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
          onReceive={async (body) => {
            const done = await run(
              () => action.mutateAsync({ id: transfer.id, action: 'receive', body }),
              t('inventory.transfers.received'),
            );
            if (done) setReceiveOpen(false);
          }}
          busy={busy}
        />
      ) : null}
    </div>
  );
}

function WarehouseField({
  label,
  warehouses,
  warehouseId,
  locationId,
  disabled,
  onChange,
}: {
  label: string;
  warehouses: { id: string; name: string }[];
  warehouseId: string;
  locationId: string | null;
  disabled: boolean;
  onChange: (warehouseId: string, locationId: string | null) => void;
}) {
  const { t } = useTranslation();
  const { data: locations } = useWarehouseLocations(warehouseId || undefined);
  const active = (locations ?? []).filter((location) => location.isActive || location.id === locationId);
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={warehouseId} onValueChange={(value) => onChange(value, null)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder={t('inventory.transfers.pickWarehouse')} />
        </SelectTrigger>
        <SelectContent>
          {warehouses.map((warehouse) => (
            <SelectItem key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {active.length > 1 ? (
        <Select
          value={locationId ?? '__default__'}
          onValueChange={(value) => onChange(warehouseId, value === '__default__' ? null : value)}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs" aria-label={t('inventory.transfers.location')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">{t('inventory.transfers.defaultLocation')}</SelectItem>
            {active.map((location) => (
              <SelectItem key={location.id} value={location.id}>
                {location.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}

function TransferLinesView({
  transfer,
  variants,
}: {
  transfer: StockTransferWithLinesDto;
  variants: ReturnType<typeof useVariantLookupMap>;
}) {
  const { t } = useTranslation();
  const dispatched = transfer.status !== 'draft' && transfer.status !== 'cancelled';
  const showValue = transfer.lines.some((line) => line.dispatchedValue);
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-center">#</TableHead>
            <TableHead>{t('inventory.documents.item')}</TableHead>
            <TableHead className="text-end">{t('documents.quantity')}</TableHead>
            {dispatched ? <TableHead className="text-end">{t('inventory.transfers.dispatchedQty')}</TableHead> : null}
            {transfer.status === 'received' ? (
              <>
                <TableHead className="text-end">{t('inventory.transfers.receivedQty')}</TableHead>
                <TableHead className="text-end">{t('inventory.transfers.shortage')}</TableHead>
              </>
            ) : null}
            {showValue ? <TableHead className="text-end">{t('inventory.transfers.value')}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {transfer.lines.map((line) => {
            const variant = variants.get(line.productVariantId);
            const shortage =
              line.receivedQuantity === null ? 0 : Math.round((line.dispatchedQuantity - line.receivedQuantity) * 10_000) / 10_000;
            return (
              <TableRow key={line.id}>
                <TableCell className="text-center text-muted-foreground">{line.lineNumber}</TableCell>
                <TableCell>
                  <div className="font-medium">{variant ? variantDisplayName(variant) : '—'}</div>
                  {line.lots.length > 0 ? (
                    <div className="text-xs text-muted-foreground" dir="ltr">
                      {line.lots.map((lot) => lot.lotNumber).join('، ')}
                    </div>
                  ) : null}
                  {line.notes ? <div className="text-xs text-muted-foreground">{line.notes}</div> : null}
                </TableCell>
                <TableCell className="text-end">
                  <QuantityWithUnit
                    quantity={line.quantity}
                    productVariantId={line.productVariantId}
                    unitOfMeasureId={line.unitOfMeasureId}
                  />
                </TableCell>
                {dispatched ? <TableCell className="text-end">{line.dispatchedQuantity}</TableCell> : null}
                {transfer.status === 'received' ? (
                  <>
                    <TableCell className="text-end">{line.receivedQuantity ?? '—'}</TableCell>
                    <TableCell className={shortage > 0 ? 'text-end font-semibold text-destructive' : 'text-end'}>
                      {shortage > 0 ? shortage : '—'}
                    </TableCell>
                  </>
                ) : null}
                {showValue ? (
                  <TableCell className="text-end">
                    {line.dispatchedValue
                      ? formatMoney(line.dispatchedValue.amountMinorUnits, line.dispatchedValue.currency)
                      : '—'}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ReceiveDialog({
  transfer,
  open,
  onOpenChange,
  onReceive,
  busy,
}: {
  transfer: StockTransferWithLinesDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReceive: (body: { lines: { lineId: string; receivedQuantity: number }[] }) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const variants = useVariantLookupMap();
  const initial = useMemo(
    () => Object.fromEntries(transfer.lines.map((line) => [line.id, String(line.dispatchedQuantity)])),
    [transfer.lines],
  );
  const [received, setReceived] = useState<Record<string, string>>(initial);
  useEffect(() => setReceived(initial), [initial]);

  function submit() {
    const lines = [];
    for (const line of transfer.lines) {
      const text = received[line.id] ?? '';
      const value = text.trim() === '' ? 0 : (parseStockQuantity(text) ?? (Number(text) === 0 ? 0 : NaN));
      if (!Number.isFinite(value) || value < 0 || value > line.dispatchedQuantity) {
        toast.error(t('inventory.transfers.receivedInvalid'));
        return;
      }
      lines.push({ lineId: line.id, receivedQuantity: value });
    }
    const short = lines.some((line, index) => line.receivedQuantity < transfer.lines[index]!.dispatchedQuantity);
    if (short && !window.confirm(t('inventory.transfers.shortageConfirm'))) return;
    onReceive({ lines });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('inventory.transfers.receiveTitle', { number: transfer.transferNumber })}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('inventory.transfers.receiveHint')}</p>
        <div className="max-h-[50vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('inventory.documents.item')}</TableHead>
                <TableHead className="w-28 text-end">{t('inventory.transfers.dispatchedQty')}</TableHead>
                <TableHead className="w-32">{t('inventory.transfers.receivedQty')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfer.lines.map((line) => {
                const variant = variants.get(line.productVariantId);
                return (
                  <TableRow key={line.id}>
                    <TableCell>{variant ? variantDisplayName(variant) : '—'}</TableCell>
                    <TableCell className="text-end">
                      {line.dispatchedQuantity} {variant?.unitOfMeasureSymbol ?? ''}
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="decimal"
                        className="h-9 text-end"
                        aria-label={t('inventory.transfers.receivedQty')}
                        value={received[line.id] ?? ''}
                        onChange={(e) => setReceived({ ...received, [line.id]: e.target.value })}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <Button onClick={submit} disabled={busy}>
          {t('inventory.transfers.confirmReceive')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
