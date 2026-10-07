import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, ScanLine, Trash2 } from 'lucide-react';
import type { ProductVariantLookupDto, StockAdjustmentReasonDto } from '@erp-platform/contracts';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';

import { ProductVariantPicker } from '../product/product-variant-picker';
import { LineUnitSelect } from '../product/unit-select';
import { resolveScan, unitPriceText, type ScaleBarcodeSettings } from '../product/variant-search';
import { useVariantLookup, useVariantLookupMap } from '../../features/inventory/api/products/queries';
import { decimalToMinorUnits } from '../../lib/money';
import { toWesternDigits } from '../../lib/search-normalize';

/**
 * Editable line of an inventory document (transfer, adjustment). Quantities
 * and costs are kept as typed text until the document is saved.
 */
export interface StockLineDraft {
  key: string;
  productVariantId: string;
  unitOfMeasureId: string | null;
  quantity: string;
  direction: 'increase' | 'decrease';
  /** Cost per line unit — adjustments that ADD stock only. Empty = current average / purchase price. */
  unitCost: string;
  lotNumber: string;
  expiryDate: string;
  reasonId: string | null;
  notes: string;
}

let sequence = 0;
export function newStockLine(patch: Partial<StockLineDraft> = {}): StockLineDraft {
  sequence += 1;
  return {
    key: `stock-line-${Date.now()}-${sequence}`,
    productVariantId: '',
    unitOfMeasureId: null,
    quantity: '1',
    direction: 'decrease',
    unitCost: '',
    lotNumber: '',
    expiryDate: '',
    reasonId: null,
    notes: '',
    ...patch,
  };
}

/** Parses typed quantity text (Arabic digits and decimal comma accepted); null when not a positive number. */
export function parseStockQuantity(text: string): number | null {
  const value = Number(toWesternDigits(text).replace(/[٫,]/g, '.').trim());
  return text.trim() === '' || !Number.isFinite(value) || value <= 0 ? null : value;
}

/** Cost text → minor units, '' → null, invalid → undefined. */
export function parseStockCost(text: string): string | null | undefined {
  if (text.trim() === '') return null;
  try {
    const minor = decimalToMinorUnits(text);
    return BigInt(minor) < 0n ? undefined : minor;
  } catch {
    return undefined;
  }
}

const NO_REASON = '__none__';

export interface StockLinesEditorProps {
  lines: StockLineDraft[];
  onChange: (lines: StockLineDraft[]) => void;
  /** Adjustments: each line chooses add / remove. */
  showDirection?: boolean;
  /** Adjustments: cost of added stock (hidden for users who may not see costs). */
  showCost?: boolean;
  /** Per-line reason override (adjustments). */
  reasons?: StockAdjustmentReasonDto[];
  /** Lot number for tracked items; expiry too when the line adds stock. */
  showLots?: boolean;
  scale?: ScaleBarcodeSettings | null;
  currency: string;
  disabled?: boolean;
}

/**
 * Line grid shared by the inventory documents. A scanner box on top adds an
 * item (or one more of it) per scan — a carton barcode adds its pack size.
 */
export function StockLinesEditor({
  lines,
  onChange,
  showDirection = false,
  showCost = false,
  reasons,
  showLots = true,
  scale,
  currency,
  disabled,
}: StockLinesEditorProps) {
  const { t } = useTranslation();
  const variants = useVariantLookupMap();
  const { data: variantList } = useVariantLookup();
  const [scan, setScan] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  function update(key: string, patch: Partial<StockLineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function onScan() {
    const code = scan.trim();
    if (!code) return;
    const result = resolveScan(variantList ?? [], code, scale);
    if (!result) {
      toast.error(t('inventory.documents.scanNotFound', { code }));
      return;
    }
    const existing = lines.find(
      (line) => line.productVariantId === result.variant.id && !line.unitOfMeasureId && !line.lotNumber,
    );
    if (existing) {
      const next = (parseStockQuantity(existing.quantity) ?? 0) + result.quantity;
      update(existing.key, { quantity: String(Math.round(next * 10_000) / 10_000) });
    } else {
      // Replace a single untouched empty line rather than leaving it dangling.
      const kept = lines.filter((line) => line.productVariantId);
      const direction = lines[lines.length - 1]?.direction ?? 'decrease';
      onChange([
        ...kept,
        newStockLine({ productVariantId: result.variant.id, quantity: String(result.quantity), direction }),
      ]);
    }
    setScan('');
    scanRef.current?.focus();
  }

  function onPick(line: StockLineDraft, variantId: string, variant: ProductVariantLookupDto) {
    update(line.key, {
      productVariantId: variantId,
      unitOfMeasureId: null,
      lotNumber: '',
      expiryDate: '',
      unitCost:
        showCost && line.direction === 'increase' && line.unitCost === ''
          ? (unitPriceText(variant, null, 'purchase', currency) ?? '')
          : line.unitCost,
    });
  }

  return (
    <div className="flex flex-col">
      {!disabled ? (
        <div className="flex items-center gap-2 border-b px-5 py-3">
          <ScanLine className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={scanRef}
            dir="ltr"
            className="max-w-md"
            placeholder={t('inventory.documents.scanPlaceholder')}
            aria-label={t('inventory.documents.scanPlaceholder')}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onScan();
              }
            }}
          />
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead>{t('inventory.documents.item')}</TableHead>
              {showDirection ? <TableHead className="w-32">{t('inventory.documents.direction')}</TableHead> : null}
              <TableHead className="w-28">{t('documents.quantity')}</TableHead>
              {showCost ? <TableHead className="w-32">{t('inventory.documents.unitCost')}</TableHead> : null}
              {showLots ? <TableHead className="w-40">{t('lots.lotNumber')}</TableHead> : null}
              {reasons ? <TableHead className="w-44">{t('inventory.documents.reason')}</TableHead> : null}
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const variant = variants.get(line.productVariantId);
              const tracked = (variant?.trackingType ?? 'none') !== 'none';
              const quantityInvalid = line.productVariantId !== '' && parseStockQuantity(line.quantity) === null;
              const costInvalid = parseStockCost(line.unitCost) === undefined;
              const usableReasons = (reasons ?? []).filter(
                (reason) =>
                  (reason.isActive || reason.id === line.reasonId) &&
                  (reason.direction === 'both' || reason.direction === line.direction),
              );
              return (
                <TableRow key={line.key}>
                  <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 py-1">
                      <ProductVariantPicker
                        className="h-9"
                        value={line.productVariantId}
                        disabled={disabled}
                        filter={(candidate) => candidate.itemType !== 'service'}
                        onChange={(value, picked) => onPick(line, value, picked)}
                      />
                      <LineUnitSelect
                        variant={variant}
                        value={line.unitOfMeasureId}
                        disabled={disabled}
                        onChange={(unitOfMeasureId) => update(line.key, { unitOfMeasureId })}
                      />
                      <Input
                        className="h-8 text-xs"
                        placeholder={t('documents.notes')}
                        aria-label={t('documents.notes')}
                        value={line.notes}
                        disabled={disabled}
                        onChange={(e) => update(line.key, { notes: e.target.value })}
                      />
                    </div>
                  </TableCell>
                  {showDirection ? (
                    <TableCell>
                      <Select
                        value={line.direction}
                        disabled={disabled}
                        onValueChange={(value) =>
                          update(line.key, { direction: value as StockLineDraft['direction'], reasonId: null })
                        }
                      >
                        <SelectTrigger className="h-9" aria-label={t('inventory.documents.direction')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="increase">{t('inventory.documents.increase')}</SelectItem>
                          <SelectItem value="decrease">{t('inventory.documents.decrease')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      className="h-9 text-end"
                      aria-label={t('documents.quantity')}
                      aria-invalid={quantityInvalid || undefined}
                      value={line.quantity}
                      disabled={disabled}
                      onChange={(e) => update(line.key, { quantity: e.target.value })}
                    />
                  </TableCell>
                  {showCost ? (
                    <TableCell>
                      {line.direction === 'increase' ? (
                        <Input
                          inputMode="decimal"
                          className="h-9 text-end"
                          placeholder={t('inventory.documents.averageCost')}
                          aria-label={t('inventory.documents.unitCost')}
                          aria-invalid={costInvalid || undefined}
                          value={line.unitCost}
                          disabled={disabled}
                          onChange={(e) => update(line.key, { unitCost: e.target.value })}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{t('inventory.documents.atAverage')}</span>
                      )}
                    </TableCell>
                  ) : null}
                  {showLots ? (
                    <TableCell>
                      {tracked ? (
                        <div className="flex flex-col gap-1">
                          <Input
                            dir="ltr"
                            className="h-9"
                            placeholder={
                              showDirection && line.direction === 'increase'
                                ? t('lots.lotNumber')
                                : t('inventory.documents.lotAuto')
                            }
                            aria-label={t('lots.lotNumber')}
                            value={line.lotNumber}
                            disabled={disabled}
                            onChange={(e) => update(line.key, { lotNumber: e.target.value })}
                          />
                          {showDirection && line.direction === 'increase' && variant?.trackingType === 'lot' ? (
                            <Input
                              type="date"
                              className="h-8 text-xs"
                              aria-label={t('lots.expiryDate')}
                              value={line.expiryDate}
                              disabled={disabled}
                              onChange={(e) => update(line.key, { expiryDate: e.target.value })}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  ) : null}
                  {reasons ? (
                    <TableCell>
                      <Select
                        value={line.reasonId ?? NO_REASON}
                        disabled={disabled}
                        onValueChange={(value) => update(line.key, { reasonId: value === NO_REASON ? null : value })}
                      >
                        <SelectTrigger className="h-9" aria-label={t('inventory.documents.reason')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_REASON}>{t('inventory.documents.documentReason')}</SelectItem>
                          {usableReasons.map((reason) => (
                            <SelectItem key={reason.id} value={reason.id}>
                              {reason.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('documents.removeLine')}
                      disabled={disabled || lines.length === 1}
                      onClick={() => onChange(lines.filter((candidate) => candidate.key !== line.key))}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {!disabled ? (
        <div className="border-t px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange([...lines, newStockLine({ direction: lines[lines.length - 1]?.direction ?? 'decrease' })])
            }
          >
            <Plus />
            {t('documents.addLine')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
