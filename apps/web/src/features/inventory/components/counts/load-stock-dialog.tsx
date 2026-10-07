import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@erp-platform/ui';
import type { LoadStockCountDto } from '@erp-platform/contracts';

import { useWarehouseLocations } from '../../api/warehouses/queries';
import { useCategoryOptions } from '../../api/catalog/queries';

const ALL = '__all__';

/**
 * Fill a stocktake from current stock — the whole warehouse, or one
 * location (shelf-by-shelf cycle counting) and/or one category with its
 * sub-categories. Only loaded lines are counted and posted, so the rest of
 * the warehouse keeps selling while one aisle is being counted.
 */
export function LoadStockDialog({
  open,
  onOpenChange,
  warehouseId,
  pending,
  onLoad,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouseId: string;
  pending: boolean;
  onLoad: (filter: LoadStockCountDto) => void;
}) {
  const { t } = useTranslation();
  const { data: locations } = useWarehouseLocations(warehouseId);
  const { options: categories } = useCategoryOptions();
  const [locationId, setLocationId] = useState(ALL);
  const [categoryId, setCategoryId] = useState(ALL);

  function withDescendants(id: string): string[] {
    const start = categories.findIndex((option) => option.id === id);
    if (start < 0) return [id];
    const ids = [id];
    for (let i = start + 1; i < categories.length && categories[i]!.depth > categories[start]!.depth; i++) {
      ids.push(categories[i]!.id);
    }
    return ids;
  }

  function submit() {
    onLoad({
      locationIds: locationId === ALL ? undefined : [locationId],
      categoryIds: categoryId === ALL ? undefined : withDescendants(categoryId),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('inventory.counts.loadStock')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('inventory.counts.loadStockHint')}</p>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>{t('inventory.counts.loadLocation')}</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('inventory.counts.allLocations')}</SelectItem>
                {(locations ?? []).map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>{t('inventory.counts.loadCategory')}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('inventory.counts.allCategories')}</SelectItem>
                {categories.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {t('inventory.counts.loadStock')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
