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
import { useStockLots, useTransferStock } from '../../api/stock/queries';
import { ApiError } from '../../../../lib/api-client';
import { ProductVariantSelector, WarehouseLocationSelector } from './selectors';

/** Same plain-controlled-state rationale as RecordMovementForm. */
export function TransferStockForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const transferStock = useTransferStock();

  const [productId, setProductId] = useState<string | undefined>();
  const [variantId, setVariantId] = useState<string | undefined>();
  const { data: productDetail } = useProduct(productId);
  const [fromWarehouseId, setFromWarehouseId] = useState<string | undefined>();
  const [fromLocationId, setFromLocationId] = useState<string | undefined>();
  const [toWarehouseId, setToWarehouseId] = useState<string | undefined>();
  const [toLocationId, setToLocationId] = useState<string | undefined>();
  const [quantity, setQuantity] = useState('');
  const [lotId, setLotId] = useState<string | undefined>();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trackingType = productDetail?.trackingType ?? 'none';
  const { data: lots } = useStockLots(trackingType !== 'none' ? variantId : undefined);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!variantId || !fromLocationId || !toLocationId || !quantity) {
      setError(t('inventory.stock.fillRequiredFields'));
      return;
    }
    if (trackingType !== 'none' && !lotId) {
      setError(t('inventory.stock.lotRequiredForTracked'));
      return;
    }
    try {
      await transferStock.mutateAsync({
        productVariantId: variantId,
        quantity: Number(quantity),
        fromLocationId,
        toLocationId,
        lotId: trackingType !== 'none' ? lotId : undefined,
        notes: notes || undefined,
      });
      toast.success(t('inventory.stock.transferSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.stock.transferError'));
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
      <div className="grid gap-2">
        <p className="text-sm font-medium">{t('inventory.stock.fromLocation')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <WarehouseLocationSelector
            warehouseId={fromWarehouseId}
            locationId={fromLocationId}
            onWarehouseChange={(id) => {
              setFromWarehouseId(id);
              setFromLocationId(undefined);
            }}
            onLocationChange={setFromLocationId}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-medium">{t('inventory.stock.toLocation')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <WarehouseLocationSelector
            warehouseId={toWarehouseId}
            locationId={toLocationId}
            onWarehouseChange={(id) => {
              setToWarehouseId(id);
              setToLocationId(undefined);
            }}
            onLocationChange={setToLocationId}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{t('inventory.stock.quantity')}</label>
        <Input type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </div>
      {trackingType !== 'none' ? (
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('inventory.stock.lot')}</label>
          <Select value={lotId} onValueChange={setLotId}>
            <SelectTrigger>
              <SelectValue placeholder={t('inventory.stock.selectLot')} />
            </SelectTrigger>
            <SelectContent>
              {(lots ?? []).map((lot) => (
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
      <Button type="submit" disabled={transferStock.isPending} className="mt-2">
        {t('common.save')}
      </Button>
    </form>
  );
}
