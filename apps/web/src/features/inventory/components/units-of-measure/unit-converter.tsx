import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnitOfMeasureDto } from '@erp-platform/contracts';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast } from '@erp-platform/ui';

import { useConvertUnitOfMeasure } from '../../api/units-of-measure/queries';
import { ApiError } from '../../../../lib/api-client';

/** Small standalone tool hitting GET /units-of-measure/convert (no persistence). */
export function UnitConverter({ units }: { units: UnitOfMeasureDto[] }) {
  const { t } = useTranslation();
  const convert = useConvertUnitOfMeasure();
  const [fromUnitId, setFromUnitId] = useState<string>('');
  const [toUnitId, setToUnitId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');

  async function handleConvert() {
    if (!fromUnitId || !toUnitId) return;
    try {
      await convert.mutateAsync({ fromUnitId, toUnitId, quantity: Number(quantity) || 0 });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="rounded-md border p-4">
      <p className="mb-3 text-sm font-medium">{t('inventory.unitsOfMeasure.converterTitle')}</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">{t('inventory.unitsOfMeasure.fromUnit')}</label>
          <Select value={fromUnitId} onValueChange={setFromUnitId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {units.map((unit) => (
                <SelectItem key={unit.id} value={unit.id}>
                  {unit.name} ({unit.symbol})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">{t('inventory.unitsOfMeasure.toUnit')}</label>
          <Select value={toUnitId} onValueChange={setToUnitId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {units.map((unit) => (
                <SelectItem key={unit.id} value={unit.id}>
                  {unit.name} ({unit.symbol})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">{t('inventory.unitsOfMeasure.quantity')}</label>
          <Input
            type="number"
            min={0}
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-28"
          />
        </div>
        <Button type="button" onClick={handleConvert} disabled={convert.isPending || !fromUnitId || !toUnitId}>
          {t('inventory.unitsOfMeasure.convert')}
        </Button>
      </div>
      {convert.data ? (
        <p className="mt-3 text-sm">
          {t('inventory.unitsOfMeasure.result')}: <span className="font-semibold">{convert.data.quantity}</span>
        </p>
      ) : null}
    </div>
  );
}
