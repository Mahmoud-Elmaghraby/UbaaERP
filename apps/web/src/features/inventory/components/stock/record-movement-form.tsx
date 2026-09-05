import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useProduct } from '../../api/products/queries';
import { useUnitsOfMeasure } from '../../api/units-of-measure/queries';
import { useRecordStockMovement, useStockLots } from '../../api/stock/queries';
import { useTenantSettings } from '../../../settings/queries';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits } from '../../../../lib/money';
import { ProductVariantSelector, WarehouseLocationSelector } from './selectors';
import type { DirectMovementType } from './stock-utils';

/**
 * Plain controlled state, not react-hook-form + zodResolver: the cascading product/variant
 * and warehouse/location pickers, and the tracking-type-conditional lot fields, make this
 * form's shape too dynamic to safely register against a single static Zod schema without
 * being able to run `tsc` in this session (see project docs). The backend's
 * `recordStockMovementSchema` remains the source of truth for validation; a rejected
 * request surfaces the backend's own error message via ApiError.
 */
export function RecordMovementForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const recordMovement = useRecordStockMovement();
  const { data: tenantSettings } = useTenantSettings();
  const { data: units } = useUnitsOfMeasure();

  const [productId, setProductId] = useState<string | undefined>();
  const [variantId, setVariantId] = useState<string | undefined>();
  const { data: productDetail } = useProduct(productId);
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [locationId, setLocationId] = useState<string | undefined>();
  const [movementType, setMovementType] = useState<DirectMovementType>('in');
  const [quantity, setQuantity] = useState('');
  const [unitOfMeasureId, setUnitOfMeasureId] = useState<string | undefined>();
  const [unitCost, setUnitCost] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [lotId, setLotId] = useState<string | undefined>();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trackingType = productDetail?.trackingType ?? 'none';
  const isReceiving = movementType === 'in' || movementType === 'adjustment_increase';
  const { data: existingLots } = useStockLots(trackingType !== 'none' && !isReceiving ? variantId : undefined);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!variantId || !locationId || !quantity) {
      setError(t('inventory.stock.fillRequiredFields'));
      return;
    }
    try {
      await recordMovement.mutateAsync({
        productVariantId: variantId,
        locationId,
        movementType,
        quantity: Number(quantity),
        unitOfMeasureId: unitOfMeasureId || undefined,
        unitCost: unitCost
          ? { amountMinorUnits: decimalToMinorUnits(unitCost), currency: tenantSettings?.currencyCode ?? 'EGP' }
          : undefined,
        lotNumber: trackingType !== 'none' && isReceiving && lotNumber ? lotNumber : undefined,
        expiryDate: trackingType === 'lot' && isReceiving && expiryDate ? new Date(expiryDate) : undefined,
        lotId: trackingType !== 'none' && !isReceiving && lotId ? lotId : undefined,
        notes: notes || undefined,
      });
      toast.success(t('inventory.stock.recordMovementSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.stock.recordMovementError'));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ProductVariantSelector
          productId={productId}
          variantId={variantId}
          onProductChange={(id) => {
            setProductId(id);
            setVariantId(undefined);
          }}
          onVariantChange={setVariantId}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <WarehouseLocationSelector
          warehouseId={warehouseId}
          locationId={locationId}
          onWarehouseChange={(id) => {
            setWarehouseId(id);
            setLocationId(undefined);
          }}
          onLocationChange={setLocationId}
        />
      </div>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{t('inventory.stock.movementType')}</label>
        <Select value={movementType} onValueChange={(v) => setMovementType(v as DirectMovementType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in">{t('inventory.stock.movementIn')}</SelectItem>
            <SelectItem value="out">{t('inventory.stock.movementOut')}</SelectItem>
            <SelectItem value="adjustment_increase">{t('inventory.stock.movementAdjustmentIncrease')}</SelectItem>
            <SelectItem value="adjustment_decrease">{t('inventory.stock.movementAdjustmentDecrease')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('inventory.stock.quantity')}</label>
          <Input type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('inventory.stock.unitOfMeasureOptional')}</label>
          <Select value={unitOfMeasureId} onValueChange={setUnitOfMeasureId}>
            <SelectTrigger>
              <SelectValue placeholder={t('inventory.stock.productDefaultUnit')} />
            </SelectTrigger>
            <SelectContent>
              {(units ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} ({u.symbol})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{t('inventory.stock.unitCostOptional')}</label>
        <Input inputMode="decimal" placeholder="0.00" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
      </div>
      {trackingType !== 'none' && isReceiving ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">{t('inventory.stock.lotNumber')}</label>
            <Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
          </div>
          {trackingType === 'lot' ? (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">{t('inventory.stock.expiryDateOptional')}</label>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          ) : null}
        </div>
      ) : null}
      {trackingType !== 'none' && !isReceiving ? (
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('inventory.stock.lotOptionalFifo')}</label>
          <Select value={lotId} onValueChange={setLotId}>
            <SelectTrigger>
              <SelectValue placeholder={t('inventory.stock.fifoAutoPick')} />
            </SelectTrigger>
            <SelectContent>
              {(existingLots ?? []).map((lot) => (
                <SelectItem key={lot.id} value={lot.id}>
                  {lot.lotNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{t('inventory.stock.notesOptional')}</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button type="submit" disabled={recordMovement.isPending} className="mt-2">
        {t('common.save')}
      </Button>
    </form>
  );
}
