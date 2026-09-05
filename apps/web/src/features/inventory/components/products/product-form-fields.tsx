import { useTranslation } from 'react-i18next';
import type { ProductTrackingTypeDto } from '@erp-platform/contracts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { useUnitsOfMeasure } from '../../api/units-of-measure/queries';

export function UnitOfMeasureField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const { data: units } = useUnitsOfMeasure();
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={t('inventory.products.selectUnit')} />
      </SelectTrigger>
      <SelectContent>
        {(units ?? []).map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name} ({u.symbol})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TrackingTypeField({
  value,
  onChange,
}: {
  value: ProductTrackingTypeDto;
  onChange: (value: ProductTrackingTypeDto) => void;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ProductTrackingTypeDto)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t('inventory.products.trackingNone')}</SelectItem>
        <SelectItem value="lot">{t('inventory.products.trackingLot')}</SelectItem>
        <SelectItem value="serial">{t('inventory.products.trackingSerial')}</SelectItem>
      </SelectContent>
    </Select>
  );
}
