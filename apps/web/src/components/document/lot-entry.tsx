import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeliveryLotDto, ReceiptLotDto } from '@erp-platform/contracts';
import { Button, Input, Textarea } from '@erp-platform/ui';
import { Plus, Trash2 } from 'lucide-react';

import { useStockLots } from '../../features/inventory/api/stock/queries';
import { toWesternDigits } from '../../lib/search-normalize';

export type TrackingType = 'none' | 'lot' | 'serial';

/**
 * Lot/serial entry for an incoming line (goods receipt, or a purchase invoice
 * that also receives the goods). Lot-tracked items: rows of lot number +
 * expiry + quantity. Serial-tracked items: one serial per text line (a
 * scanner can fire them in one after another), with one optional expiry.
 */
export interface ReceiptLotsDraft {
  rows: { lotNumber: string; expiryDate: string; quantity: string }[];
  serialsText: string;
  serialsExpiry: string;
}

export function emptyReceiptLotsDraft(): ReceiptLotsDraft {
  return { rows: [{ lotNumber: '', expiryDate: '', quantity: '' }], serialsText: '', serialsExpiry: '' };
}

function splitSerials(text: string): string[] {
  return text
    .split(/[\n,،\t]+/)
    .map((serial) => toWesternDigits(serial).trim())
    .filter(Boolean);
}

/** Total entered so far (serial count, or the sum of lot quantities). */
export function receiptLotsTotal(trackingType: TrackingType, draft: ReceiptLotsDraft): number {
  if (trackingType === 'serial') return splitSerials(draft.serialsText).length;
  return draft.rows.reduce((sum, row) => sum + (Number(toWesternDigits(row.quantity)) || 0), 0);
}

export type ReceiptLotsResult =
  | { lots: ReceiptLotDto[] }
  | { error: 'lotsRequired' | 'lotsInvalid' | 'lotsMismatch' | 'serialDuplicate' };

/** Validates a draft against the line quantity and converts it to the API shape. */
export function receiptLotsToDto(
  trackingType: TrackingType,
  draft: ReceiptLotsDraft,
  quantity: number,
): ReceiptLotsResult {
  if (trackingType === 'none') return { lots: [] };
  let lots: ReceiptLotDto[];
  if (trackingType === 'serial') {
    const serials = splitSerials(draft.serialsText);
    if (serials.length === 0) return { error: 'lotsRequired' };
    if (new Set(serials).size !== serials.length) return { error: 'serialDuplicate' };
    lots = serials.map((serial) => ({ lotNumber: serial, expiryDate: draft.serialsExpiry || null, quantity: 1 }));
  } else {
    const filled = draft.rows.filter((row) => row.lotNumber.trim() || row.quantity.trim());
    if (filled.length === 0) return { error: 'lotsRequired' };
    lots = [];
    for (const row of filled) {
      const qty = Number(toWesternDigits(row.quantity));
      if (!row.lotNumber.trim() || !Number.isFinite(qty) || qty <= 0) return { error: 'lotsInvalid' };
      lots.push({
        lotNumber: toWesternDigits(row.lotNumber).trim(),
        expiryDate: row.expiryDate || null,
        quantity: qty,
      });
    }
  }
  const total = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  if (Math.abs(total - quantity) > 1e-6) return { error: 'lotsMismatch' };
  return { lots };
}

export function ReceiptLotsEditor({
  trackingType,
  quantity,
  draft,
  onChange,
}: {
  trackingType: Exclude<TrackingType, 'none'>;
  quantity: number;
  draft: ReceiptLotsDraft;
  onChange: (draft: ReceiptLotsDraft) => void;
}) {
  const { t } = useTranslation();
  const total = receiptLotsTotal(trackingType, draft);
  const matches = quantity > 0 && Math.abs(total - quantity) < 1e-6;

  const counter = (
    <span className={matches ? 'text-xs text-emerald-600' : 'text-xs text-muted-foreground'}>
      {t('lots.entered', { entered: total, quantity: quantity || 0 })}
    </span>
  );

  if (trackingType === 'serial') {
    return (
      <div className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-[1fr_12rem]">
        <div className="grid gap-1">
          <span className="text-xs font-medium">{t('lots.serialsLabel')}</span>
          <Textarea
            rows={3}
            dir="ltr"
            className="font-mono text-sm"
            placeholder={t('lots.serialsPlaceholder')}
            aria-label={t('lots.serialsLabel')}
            value={draft.serialsText}
            onChange={(e) => onChange({ ...draft, serialsText: e.target.value })}
          />
          {counter}
        </div>
        <div className="grid content-start gap-1">
          <span className="text-xs font-medium">
            {t('lots.expiryDate')} ({t('documents.optional')})
          </span>
          <Input
            type="date"
            aria-label={t('lots.expiryDate')}
            value={draft.serialsExpiry}
            onChange={(e) => onChange({ ...draft, serialsExpiry: e.target.value })}
          />
        </div>
      </div>
    );
  }

  function updateRow(index: number, patch: Partial<ReceiptLotsDraft['rows'][number]>) {
    onChange({ ...draft, rows: draft.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  }

  return (
    <div className="grid gap-2 rounded-md bg-muted/40 p-3">
      <div className="grid grid-cols-[1fr_10rem_7rem_2.25rem] gap-2 text-xs font-medium text-muted-foreground">
        <span>{t('lots.lotNumber')}</span>
        <span>{t('lots.expiryDate')}</span>
        <span>{t('documents.quantity')}</span>
        <span />
      </div>
      {draft.rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[1fr_10rem_7rem_2.25rem] gap-2">
          <Input
            className="h-8"
            dir="ltr"
            aria-label={t('lots.lotNumber')}
            value={row.lotNumber}
            onChange={(e) => updateRow(index, { lotNumber: e.target.value })}
          />
          <Input
            className="h-8"
            type="date"
            aria-label={t('lots.expiryDate')}
            value={row.expiryDate}
            onChange={(e) => updateRow(index, { expiryDate: e.target.value })}
          />
          <Input
            className="h-8 text-end"
            inputMode="decimal"
            aria-label={t('documents.quantity')}
            placeholder={draft.rows.length === 1 && quantity > 0 ? String(quantity) : undefined}
            value={row.quantity}
            onChange={(e) => updateRow(index, { quantity: e.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('documents.removeLine')}
            disabled={draft.rows.length === 1}
            onClick={() => onChange({ ...draft, rows: draft.rows.filter((_, i) => i !== index) })}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange({ ...draft, rows: [...draft.rows, { lotNumber: '', expiryDate: '', quantity: '' }] })}
        >
          <Plus />
          {t('lots.addLot')}
        </Button>
        {counter}
      </div>
    </div>
  );
}

/** A single-row lot draft whose blank quantity means "the whole line" — fills it in before validation. */
export function withImplicitSingleLotQuantity(draft: ReceiptLotsDraft, quantity: number): ReceiptLotsDraft {
  if (draft.rows.length === 1 && draft.rows[0]!.lotNumber.trim() && !draft.rows[0]!.quantity.trim() && quantity > 0) {
    return { ...draft, rows: [{ ...draft.rows[0]!, quantity: String(quantity) }] };
  }
  return draft;
}

/**
 * Optional lot picking on an outgoing line (delivery). Empty = Inventory
 * picks FEFO and skips expired lots. Lists the lots with stock in the
 * chosen warehouse, soonest expiry first; expired lots are shown but can't
 * be picked.
 */
export function DeliveryLotsPicker({
  productVariantId,
  warehouseId,
  trackingType,
  quantity,
  value,
  onChange,
}: {
  productVariantId: string;
  warehouseId: string;
  trackingType: Exclude<TrackingType, 'none'>;
  quantity: number;
  value: DeliveryLotDto[];
  onChange: (lots: DeliveryLotDto[]) => void;
}) {
  const { t } = useTranslation();
  const { data: lots, isLoading } = useStockLots(productVariantId);
  const today = new Date().toLocaleDateString('en-CA');

  const options = useMemo(
    () =>
      (lots ?? [])
        .map((lot) => {
          const available = lot.levels
            .filter((level) => level.warehouseId === warehouseId)
            .reduce((sum, level) => sum + level.quantityOnHand, 0);
          // Local calendar day (the API sends DATE columns as local-midnight timestamps).
          const expiry = lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString('en-CA') : null;
          return { lotNumber: lot.lotNumber, available, expiry, expired: expiry !== null && expiry < today };
        })
        .filter((option) => option.available > 0)
        .sort((a, b) => (a.expiry ?? '9999').localeCompare(b.expiry ?? '9999')),
    [lots, warehouseId, today],
  );

  const picked = new Map(value.map((lot) => [lot.lotNumber, lot.quantity]));
  const total = value.reduce((sum, lot) => sum + lot.quantity, 0);

  function setQuantity(lotNumber: string, qty: number) {
    const next = options
      .map((option) => ({
        lotNumber: option.lotNumber,
        quantity: option.lotNumber === lotNumber ? qty : (picked.get(option.lotNumber) ?? 0),
      }))
      .filter((lot) => lot.quantity > 0);
    onChange(next);
  }

  if (isLoading) return <p className="text-xs text-muted-foreground">…</p>;
  if (options.length === 0) return <p className="text-xs text-destructive">{t('lots.noneInWarehouse')}</p>;

  return (
    <div className="grid gap-1.5 rounded-md bg-muted/40 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{t('lots.pickTitle')}</span>
        <span
          className={
            value.length === 0
              ? 'text-muted-foreground'
              : Math.abs(total - quantity) < 1e-6
                ? 'text-emerald-600'
                : 'text-destructive'
          }
        >
          {value.length === 0 ? t('lots.autoFefo') : t('lots.entered', { entered: total, quantity })}
        </span>
      </div>
      {options.map((option) => (
        <label
          key={option.lotNumber}
          className="grid grid-cols-[1fr_auto_6rem] items-center gap-2 text-sm"
          title={option.expired ? t('lots.expired') : undefined}
        >
          <span
            dir="ltr"
            className={option.expired ? 'text-end font-mono text-muted-foreground line-through' : 'text-end font-mono'}
          >
            {option.lotNumber}
          </span>
          <span className="text-xs text-muted-foreground">
            {option.expiry ? (
              <>
                {t('lots.expiresOn')} <bdi dir="ltr">{option.expiry}</bdi>
              </>
            ) : (
              t('lots.noExpiry')
            )}{' '}
            · {t('documents.available')} {option.available}
            {option.expired ? ` · ${t('lots.expired')}` : ''}
          </span>
          {trackingType === 'serial' ? (
            <input
              type="checkbox"
              className="justify-self-end"
              disabled={option.expired}
              checked={picked.has(option.lotNumber)}
              onChange={(e) => setQuantity(option.lotNumber, e.target.checked ? 1 : 0)}
            />
          ) : (
            <Input
              className="h-8 text-end"
              inputMode="decimal"
              disabled={option.expired}
              aria-label={`${t('documents.quantity')} ${option.lotNumber}`}
              value={picked.get(option.lotNumber) ?? ''}
              onChange={(e) => {
                const qty = Number(toWesternDigits(e.target.value));
                setQuantity(option.lotNumber, Number.isFinite(qty) && qty > 0 ? Math.min(qty, option.available) : 0);
              }}
            />
          )}
        </label>
      ))}
    </div>
  );
}

/** Read-only lot list under a document line: "A1 ×6 (exp 2027-01-31) · B1 ×4". */
export function LotsSummary({ lots }: { lots: { lotNumber: string; quantity: number; expiryDate?: string | null }[] }) {
  const { t } = useTranslation();
  if (lots.length === 0) return null;
  return (
    <div className="mt-1 text-xs text-muted-foreground">
      {t('lots.title')}:{' '}
      {lots.map((lot, index) => (
        <span key={`${lot.lotNumber}-${index}`}>
          {index > 0 ? ' · ' : ''}
          <span dir="ltr" className="font-mono">
            {lot.lotNumber}
          </span>{' '}
          ×{lot.quantity}
          {lot.expiryDate ? (
            <>
              {' '}
              ({t('lots.expiresOn')} <bdi dir="ltr">{lot.expiryDate}</bdi>)
            </>
          ) : null}
        </span>
      ))}
    </div>
  );
}
