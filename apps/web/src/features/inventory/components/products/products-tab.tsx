import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { ProductDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Combobox,
  toast,
} from '@erp-platform/ui';

import { useDeleteProduct, useProducts } from '../../api/products/queries';
import { useUnitsOfMeasure } from '../../api/units-of-measure/queries';
import { useCategoryOptions } from '../../api/catalog/queries';
import { formatMoney } from '../../../../lib/money';
import { CreateProductForm, EditProductForm } from './product-form';
import { ProductVariantsDialog } from './product-variants-dialog';
import { ApiError } from '../../../../lib/api-client';

export function ProductsTab() {
  const { t } = useTranslation();
  const { data: products, isLoading } = useProducts();
  const { data: units } = useUnitsOfMeasure();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ProductDto | null>(null);
  const [managingVariantsFor, setManagingVariantsFor] = useState<ProductDto | null>(null);
  const deleteProduct = useDeleteProduct();

  const unitById = useMemo(() => new Map((units ?? []).map((u) => [u.id, u])), [units]);
  const { options: categoryOptions } = useCategoryOptions();
  const categoryById = useMemo(() => new Map(categoryOptions.map((option) => [option.id, option])), [categoryOptions]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // A category filter includes its sub-categories (path prefix match on the flattened tree).
  const visibleProducts = useMemo(() => {
    if (!categoryFilter) return products ?? [];
    const selected = categoryById.get(categoryFilter);
    if (!selected) return products ?? [];
    const ids = new Set(
      categoryOptions
        .filter((option) => option.id === selected.id || option.path.startsWith(`${selected.path} › `))
        .map((option) => option.id),
    );
    return (products ?? []).filter((product) => product.categoryId && ids.has(product.categoryId));
  }, [products, categoryFilter, categoryById, categoryOptions]);

  async function handleDelete(id: string) {
    if (!window.confirm(t('inventory.products.deleteConfirm'))) return;
    try {
      await deleteProduct.mutateAsync(id);
      toast.success(t('inventory.products.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<ProductDto>[]>(
    () => [
      { accessorKey: 'code', header: t('inventory.products.code') },
      {
        accessorKey: 'name',
        header: t('inventory.products.name'),
        cell: ({ row }: { row: Row<ProductDto> }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.itemType === 'service' ? (
              <Badge variant="info">{t('inventory.products.itemTypeService')}</Badge>
            ) : null}
          </span>
        ),
      },
      {
        id: 'category',
        header: t('inventory.products.category'),
        accessorFn: (row: ProductDto) => (row.categoryId ? categoryById.get(row.categoryId)?.path ?? '' : ''),
        cell: ({ getValue }) => (getValue<string>() ? getValue<string>() : <span className="text-muted-foreground">—</span>),
      },
      {
        id: 'salePrice',
        header: t('inventory.products.salePriceShort'),
        accessorFn: (row: ProductDto) => (row.salePrice ? Number(row.salePrice.amountMinorUnits) : -1),
        cell: ({ row }: { row: Row<ProductDto> }) =>
          row.original.salePrice ? (
            <span className="tabular">
              {formatMoney(row.original.salePrice.amountMinorUnits, row.original.salePrice.currency)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'unit',
        header: t('inventory.products.unit'),
        accessorFn: (row: ProductDto) => unitById.get(row.unitOfMeasureId)?.name ?? '—',
      },
      {
        id: 'trackingType',
        header: t('inventory.products.trackingType'),
        accessorFn: (row: ProductDto) => row.trackingType,
        cell: ({ row }: { row: Row<ProductDto> }) => {
          const type = row.original.trackingType;
          if (type === 'none') {
            return (
              <span className="text-muted-foreground">{t('inventory.products.trackingNone')}</span>
            );
          }
          return (
            <Badge variant="secondary">
              {type === 'lot'
                ? t('inventory.products.trackingLot')
                : t('inventory.products.trackingSerial')}
            </Badge>
          );
        },
      },
      {
        id: 'isActive',
        header: t('common.status'),
        accessorFn: (row: ProductDto) => row.isActive,
        cell: ({ row }: { row: Row<ProductDto> }) => (
          <Badge variant={row.original.isActive ? 'success' : 'neutral'} dot>
            {row.original.isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<ProductDto> }) => (
          <Can permission="inventory.manage">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setManagingVariantsFor(row.original)}>
                  {t('inventory.products.manageVariants')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setEditing(row.original)}>
                  {t('common.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleDelete(row.original.id)}>
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Can>
        ),
      },
    ],
    [t, unitById, categoryById],
  );

  return (
    <div className="grid gap-4">
      <DataTable
        columns={columns}
        data={visibleProducts}
        isLoading={isLoading}
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="w-full max-w-xs">
              <Combobox
                items={categoryOptions}
                value={categoryFilter}
                onValueChange={(id) => setCategoryFilter(id)}
                getValue={(option) => option.id}
                getLabel={(option) => option.path}
                placeholder={t('inventory.products.allCategories')}
                searchPlaceholder={t('common.search')}
                emptyText={t('common.noResults')}
                className="h-9"
              />
            </div>
            {categoryFilter ? (
              <Button variant="ghost" size="sm" onClick={() => setCategoryFilter(null)}>
                {t('inventory.stock.clearFilters')}
              </Button>
            ) : null}
            <div className="ms-auto" />
            <Can permission="inventory.manage">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button>{t('inventory.products.newProduct')}</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{t('inventory.products.newProduct')}</DialogTitle>
                  </DialogHeader>
                  <CreateProductForm onDone={() => setCreateOpen(false)} />
                </DialogContent>
              </Dialog>
            </Can>
          </div>
        }
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
          </DialogHeader>
          {editing ? <EditProductForm product={editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>

      <ProductVariantsDialog
        product={managingVariantsFor}
        onClose={() => setManagingVariantsFor(null)}
      />
    </div>
  );
}
