import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LandedCostDto } from '@erp-platform/contracts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { useLocationLookups } from '../../api/warehouses/queries';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';

/** Where a landed cost went: per received line, what was capitalised into stock and what was expensed (stock already sold). */
export function LandedCostAllocationsTable({ landedCost }: { landedCost: LandedCostDto }) {
  const { t } = useTranslation();
  const variantIndex = useVariantIndex();
  const { warehouseById, locationById } = useLocationLookups();

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t('inventory.stock.product')}</TableHead>
            <TableHead>{t('inventory.products.sku')}</TableHead>
            <TableHead>{t('inventory.stock.location')}</TableHead>
            <TableHead className="text-end">{t('inventory.landedCosts.allocatedAmount')}</TableHead>
            <TableHead className="text-end">{t('inventory.landedCosts.expensedAmount')}</TableHead>
            <TableHead className="text-end">{t('inventory.stock.resultingAverageCost')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {landedCost.allocations.map((allocation) => {
            const entry = variantIndex.get(allocation.productVariantId);
            return (
              <TableRow key={allocation.id}>
                <TableCell className="font-medium">
                  {entry ? (
                    <Link to={`/inventory/products/${entry.productId}`} className="hover:text-primary hover:underline">
                      {entry.productName}
                    </Link>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground" dir="ltr">{entry?.sku ?? '—'}</TableCell>
                <TableCell>
                  {warehouseById.get(allocation.warehouseId)?.name ?? '—'} / {locationById.get(allocation.locationId)?.name ?? '—'}
                </TableCell>
                <TableCell className={AMOUNT_CELL}>
                  <Amount value={allocation.allocatedAmount.amountMinorUnits} hideCurrency />
                </TableCell>
                <TableCell className={AMOUNT_CELL}>
                  <Amount value={allocation.expensedAmount.amountMinorUnits} hideCurrency />
                </TableCell>
                <TableCell className={AMOUNT_CELL}>
                  <Amount value={allocation.resultingAverageCost.amountMinorUnits} hideCurrency />
                </TableCell>
              </TableRow>
            );
          })}
          {landedCost.allocations.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                {t('common.noResults')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
