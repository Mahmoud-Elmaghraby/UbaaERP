import { useTranslation } from 'react-i18next';
import {
  Badge,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { useStockLots } from '../../api/stock/queries';
import { useLocationLookups } from '../../hooks/stock/use-location-lookups';
import { formatMoney } from '../../../../lib/money';

export function StockLotsView({ productVariantId }: { productVariantId: string | undefined }) {
  const { t } = useTranslation();
  const { data: lots, isLoading } = useStockLots(productVariantId);
  const { warehouseById, locationById } = useLocationLookups();

  if (!productVariantId) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        {t('inventory.stock.selectVariantForLots')}
      </div>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('inventory.stock.lotNumber')}</TableHead>
          <TableHead>{t('inventory.stock.expiryDate')}</TableHead>
          <TableHead>{t('inventory.stock.unitCost')}</TableHead>
          <TableHead>{t('inventory.stock.quantityByLocation')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(lots ?? []).map((lot) => (
          <TableRow key={lot.id}>
            <TableCell className="font-medium">{lot.lotNumber}</TableCell>
            <TableCell>{lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString('ar-EG') : '—'}</TableCell>
            <TableCell>{lot.unitCost ? formatMoney(lot.unitCost.amountMinorUnits, lot.unitCost.currency) : '—'}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {lot.levels.map((level) => (
                  <Badge key={level.id} variant="secondary">
                    {warehouseById.get(level.warehouseId)?.name ?? '—'} / {locationById.get(level.locationId)?.name ?? '—'}:{' '}
                    {level.quantityOnHand}
                  </Badge>
                ))}
              </div>
            </TableCell>
          </TableRow>
        ))}
        {(lots ?? []).length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
              {t('common.noResults')}
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
