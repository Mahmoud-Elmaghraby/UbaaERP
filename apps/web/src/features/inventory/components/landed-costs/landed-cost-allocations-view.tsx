import { useTranslation } from 'react-i18next';
import type { LandedCostDto } from '@erp-platform/contracts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useVariantIndex } from '../../hooks/landed-costs/use-variant-index';
import { useLocationLookups } from '../../hooks/landed-costs/use-location-lookups';
import { formatMoney } from '../../../../lib/money';

export function LandedCostAllocationsView({ landedCost }: { landedCost: LandedCostDto }) {
  const { t } = useTranslation();
  const variantIndex = useVariantIndex();
  const { warehouseById, locationById } = useLocationLookups();

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">{t('inventory.landedCosts.totalCost')}</p>
          <p className="font-medium">{formatMoney(landedCost.totalCost.amountMinorUnits, landedCost.totalCost.currency)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('inventory.landedCosts.allocationMethod')}</p>
          <p className="font-medium">
            {landedCost.allocationMethod === 'by_quantity'
              ? t('inventory.landedCosts.byQuantity')
              : t('inventory.landedCosts.byValue')}
          </p>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('inventory.stock.product')}</TableHead>
            <TableHead>{t('inventory.products.sku')}</TableHead>
            <TableHead>{t('inventory.stock.location')}</TableHead>
            <TableHead>{t('inventory.landedCosts.allocatedAmount')}</TableHead>
            <TableHead>{t('inventory.stock.resultingAverageCost')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {landedCost.allocations.map((allocation) => (
            <TableRow key={allocation.id}>
              <TableCell>{variantIndex.get(allocation.productVariantId)?.productName ?? '—'}</TableCell>
              <TableCell>{variantIndex.get(allocation.productVariantId)?.sku ?? '—'}</TableCell>
              <TableCell>
                {warehouseById.get(allocation.warehouseId)?.name ?? '—'} / {locationById.get(allocation.locationId)?.name ?? '—'}
              </TableCell>
              <TableCell>{formatMoney(allocation.allocatedAmount.amountMinorUnits, allocation.allocatedAmount.currency)}</TableCell>
              <TableCell>
                {formatMoney(allocation.resultingAverageCost.amountMinorUnits, allocation.resultingAverageCost.currency)}
              </TableCell>
            </TableRow>
          ))}
          {landedCost.allocations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                {t('common.noResults')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
