import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { StockMovementDto } from '@erp-platform/contracts';
import { Badge, DataTable } from '@erp-platform/ui';

import { useStockMovements, type StockMovementFilters } from '../../api/stock/queries';
import { useVariantIndex } from '../../hooks/stock/use-variant-index';
import { useLocationLookups } from '../../hooks/stock/use-location-lookups';
import { formatMoney } from '../../../../lib/money';
import { movementTypeLabel } from './stock-utils';

export function StockMovementsView({ filters }: { filters: StockMovementFilters }) {
  const { t } = useTranslation();
  const { data: movements, isLoading } = useStockMovements({ ...filters, limit: 100 });
  const variantIndex = useVariantIndex();
  const { warehouseById, locationById } = useLocationLookups();

  const columns = useMemo<ColumnDef<StockMovementDto>[]>(
    () => [
      {
        id: 'date',
        header: t('inventory.stock.date'),
        accessorFn: (row: StockMovementDto) => new Date(row.createdAt).toLocaleString('ar-EG'),
      },
      {
        id: 'product',
        header: t('inventory.stock.product'),
        accessorFn: (row: StockMovementDto) => variantIndex.get(row.productVariantId)?.productName ?? '—',
      },
      {
        id: 'sku',
        header: t('inventory.products.sku'),
        accessorFn: (row: StockMovementDto) => variantIndex.get(row.productVariantId)?.sku ?? '—',
      },
      {
        id: 'location',
        header: t('inventory.stock.location'),
        accessorFn: (row: StockMovementDto) =>
          `${warehouseById.get(row.warehouseId)?.name ?? '—'} / ${locationById.get(row.locationId)?.name ?? '—'}`,
      },
      {
        id: 'type',
        header: t('inventory.stock.type'),
        accessorFn: (row: StockMovementDto) => row.movementType,
        cell: ({ row }: { row: Row<StockMovementDto> }) => (
          <Badge variant="secondary">{movementTypeLabel(t, row.original.movementType)}</Badge>
        ),
      },
      { accessorKey: 'quantity', header: t('inventory.stock.quantity') },
      {
        id: 'unitCost',
        header: t('inventory.stock.unitCost'),
        cell: ({ row }: { row: Row<StockMovementDto> }) =>
          row.original.unitCost ? formatMoney(row.original.unitCost.amountMinorUnits, row.original.unitCost.currency) : '—',
      },
      {
        id: 'resultingAverageCost',
        header: t('inventory.stock.resultingAverageCost'),
        cell: ({ row }: { row: Row<StockMovementDto> }) =>
          row.original.resultingAverageCost
            ? formatMoney(row.original.resultingAverageCost.amountMinorUnits, row.original.resultingAverageCost.currency)
            : '—',
      },
      {
        id: 'notes',
        header: t('inventory.stock.notes'),
        accessorFn: (row: StockMovementDto) => row.notes ?? '—',
      },
    ],
    [t, variantIndex, warehouseById, locationById],
  );

  return <DataTable columns={columns} data={movements ?? []} isLoading={isLoading} pageSize={20} />;
}
