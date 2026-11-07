import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ColumnDef, Row } from '@tanstack/react-table';
import {
  setReorderPointSchema,
  type SetReorderPointDto,
  type StockLevelDto,
} from '@erp-platform/contracts';
import {
  Button,
  Can,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  toast,
  useHasAnyPermission,
} from '@erp-platform/ui';

import { useSetReorderPoint, useStockLevels, type StockLevelFilters } from '../../api/stock/queries';
import { useVariantIndex } from '../../../../components/product/use-variant-index';
import { useLocationLookups } from '../../api/warehouses/queries';
import { formatMoney, multiplyMinorUnits } from '../../../../lib/money';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { formatQuantity } from '../../../../components/report/report-format';
import { ApiError } from '../../../../lib/api-client';
import { INV } from '../../../../lib/permissions';

export function StockLevelsView({ filters }: { filters: StockLevelFilters }) {
  const { t } = useTranslation();
  const { data: levels, isLoading } = useStockLevels(filters);
  const variantIndex = useVariantIndex();
  const { warehouseById, locationById } = useLocationLookups();
  const [editingLevel, setEditingLevel] = useState<StockLevelDto | null>(null);

  const columns = useMemo<ColumnDef<StockLevelDto>[]>(
    () => [
      {
        id: 'product',
        header: t('inventory.stock.product'),
        accessorFn: (row: StockLevelDto) => variantIndex.get(row.productVariantId)?.productName ?? '—',
        cell: ({ row }: { row: Row<StockLevelDto> }) => {
          const entry = variantIndex.get(row.original.productVariantId);
          return entry ? (
            <Link to={`/inventory/products/${entry.productId}`} className="font-medium hover:text-primary hover:underline">
              {entry.productName}
            </Link>
          ) : (
            '—'
          );
        },
      },
      {
        id: 'sku',
        header: t('inventory.products.sku'),
        accessorFn: (row: StockLevelDto) => variantIndex.get(row.productVariantId)?.sku ?? '—',
      },
      {
        id: 'warehouse',
        header: t('inventory.stock.warehouse'),
        accessorFn: (row: StockLevelDto) => warehouseById.get(row.warehouseId)?.name ?? '—',
      },
      {
        id: 'location',
        header: t('inventory.stock.location'),
        accessorFn: (row: StockLevelDto) => locationById.get(row.locationId)?.name ?? '—',
      },
      {
        accessorKey: 'quantityOnHand',
        header: () => <div className="text-end">{t('inventory.stock.quantityOnHand')}</div>,
        cell: ({ row }: { row: Row<StockLevelDto> }) => {
          const { quantityOnHand, reorderPoint } = row.original;
          const tone = quantityOnHand < 0 ? 'text-danger' : reorderPoint !== null && quantityOnHand <= reorderPoint ? 'text-warning' : '';
          return <div className={`${AMOUNT_CELL} font-medium ${tone}`}>{formatQuantity(quantityOnHand)}</div>;
        },
      },
      {
        id: 'reorderPoint',
        header: t('inventory.stock.reorderPoint'),
        accessorFn: (row: StockLevelDto) => row.reorderPoint ?? '—',
      },
      {
        id: 'averageCost',
        header: t('inventory.stock.averageCost'),
        cell: ({ row }: { row: Row<StockLevelDto> }) =>
          row.original.averageCost
            ? formatMoney(row.original.averageCost.amountMinorUnits, row.original.averageCost.currency)
            : '—',
      },
      {
        id: 'stockValue',
        header: () => <div className="text-end">{t('inventory.products.stockValue')}</div>,
        accessorFn: (row: StockLevelDto) =>
          row.averageCost ? Number(multiplyMinorUnits(row.averageCost.amountMinorUnits, String(row.quantityOnHand))) : 0,
        cell: ({ row }: { row: Row<StockLevelDto> }) =>
          row.original.averageCost ? (
            <div className={AMOUNT_CELL}>
              <Amount
                value={multiplyMinorUnits(row.original.averageCost.amountMinorUnits, String(row.original.quantityOnHand))}
                hideCurrency
              />
            </div>
          ) : (
            '—'
          ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<StockLevelDto> }) => (
          <Can permission={INV.movementsManage}>
            <Button variant="ghost" size="sm" onClick={() => setEditingLevel(row.original)}>
              {t('inventory.stock.setReorderPoint')}
            </Button>
          </Can>
        ),
      },
    ],
    [t, variantIndex, warehouseById, locationById],
  );
  // Users without inventory.costs.view get no cost columns at all (the API already sends null).
  const showCost = useHasAnyPermission([INV.costsView]);
  const visibleColumns = useMemo(
    () => (showCost ? columns : columns.filter((column) => !['averageCost', 'stockValue'].includes(column.id ?? ''))),
    [columns, showCost],
  );

  return (
    <div className="grid gap-3">
      <DataTable columns={visibleColumns} data={levels ?? []} isLoading={isLoading} />
      <Dialog open={editingLevel !== null} onOpenChange={(open) => !open && setEditingLevel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('inventory.stock.setReorderPoint')}</DialogTitle>
          </DialogHeader>
          {editingLevel ? <ReorderPointForm level={editingLevel} onDone={() => setEditingLevel(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReorderPointForm({ level, onDone }: { level: StockLevelDto; onDone: () => void }) {
  const { t } = useTranslation();
  const setReorderPoint = useSetReorderPoint();

  const form = useForm<SetReorderPointDto>({
    resolver: zodResolver(setReorderPointSchema),
    defaultValues: { reorderPoint: level.reorderPoint },
  });

  async function onSubmit(values: SetReorderPointDto) {
    try {
      await setReorderPoint.mutateAsync({ id: level.id, input: values });
      toast.success(t('inventory.stock.reorderPointSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.stock.reorderPointError'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="reorderPoint"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.stock.reorderPoint')}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={setReorderPoint.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
