import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { StockMovementDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  DataTable,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useHasAnyPermission,
} from '@erp-platform/ui';
import { Link } from 'react-router-dom';

import { useStockMovements, type StockMovementFilters } from '../../api/stock/queries';
import { useVariantIndex } from '../../hooks/stock/use-variant-index';
import { useLocationLookups } from '../../hooks/stock/use-location-lookups';
import { formatMoney } from '../../../../lib/money';
import { INV } from '../../../../lib/permissions';
import { movementTypeLabel } from './stock-utils';

const MOVEMENT_TYPES = ['in', 'out', 'transfer_in', 'transfer_out', 'adjustment_increase', 'adjustment_decrease'] as const;
const ALL = '__all__';

/** Inventory documents with their own page — the reference column links to them. */
const DOCUMENT_ROUTES: Record<string, string> = {
  stock_transfer: '/inventory/transfers',
  stock_adjustment: '/inventory/adjustments',
  stock_count: '/inventory/counts',
  opening_balance: '/inventory/counts',
};

export function StockMovementsView({ filters }: { filters: StockMovementFilters }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState<string>(ALL);
  const [limit, setLimit] = useState(200);
  const { data: movements, isLoading } = useStockMovements({
    ...filters,
    from: from || undefined,
    to: to || undefined,
    types: type === ALL ? undefined : type,
    limit,
  });
  const variantIndex = useVariantIndex();
  const { warehouseById, locationById } = useLocationLookups();

  const columns = useMemo<ColumnDef<StockMovementDto>[]>(
    () => [
      {
        id: 'date',
        header: t('inventory.stock.date'),
        // Sort by the moment, show it localised (sorting the localised text was wrong).
        accessorFn: (row: StockMovementDto) => new Date(row.createdAt).getTime(),
        cell: ({ row }: { row: Row<StockMovementDto> }) => new Date(row.original.createdAt).toLocaleString('ar-EG'),
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
        id: 'reference',
        header: t('inventory.stock.reference'),
        cell: ({ row }: { row: Row<StockMovementDto> }) => {
          const { referenceType, referenceId } = row.original;
          if (!referenceType) return '—';
          const label = t(`inventory.stock.references.${referenceType}`, { defaultValue: referenceType });
          const route = DOCUMENT_ROUTES[referenceType];
          return route && referenceId ? (
            <Link className="text-primary hover:underline" to={`${route}/${referenceId}`}>
              {label}
            </Link>
          ) : (
            label
          );
        },
      },
      {
        id: 'notes',
        header: t('inventory.stock.notes'),
        accessorFn: (row: StockMovementDto) => row.notes ?? '—',
      },
    ],
    [t, variantIndex, warehouseById, locationById],
  );
  // Users without inventory.costs.view get no cost columns at all (the API already sends null).
  const showCost = useHasAnyPermission([INV.costsView]);
  const visibleColumns = useMemo(
    () => (showCost ? columns : columns.filter((column) => !['unitCost', 'resultingAverageCost'].includes(column.id ?? ''))),
    [columns, showCost],
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="movements-from">{t('inventory.stock.from')}</Label>
          <Input id="movements-from" type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="movements-to">{t('inventory.stock.to')}</Label>
          <Input id="movements-to" type="date" className="w-44" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>{t('inventory.stock.type')}</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('common.all')}</SelectItem>
              {MOVEMENT_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {movementTypeLabel(t, value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(movements?.length ?? 0) >= limit ? (
          <Button variant="outline" onClick={() => setLimit(limit * 5)}>
            {t('inventory.stock.loadMore')}
          </Button>
        ) : null}
      </div>
      <DataTable columns={visibleColumns} data={movements ?? []} isLoading={isLoading} pageSize={20} />
    </div>
  );
}
