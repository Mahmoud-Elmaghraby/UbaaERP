import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { useWarehouses } from '../../api/warehouses/queries';

export const ALL_WAREHOUSES = 'all';

/** Warehouse dropdown with an "all" option, shared by the inventory reports. */
export function WarehouseFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const { data: warehouses } = useWarehouses();
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{t('documents.warehouse')}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_WAREHOUSES}>{t('documents.all')}</SelectItem>
          {(warehouses ?? []).map((warehouse) => (
            <SelectItem key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
