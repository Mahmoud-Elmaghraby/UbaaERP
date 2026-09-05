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
  toast,
} from '@erp-platform/ui';

import { useDeleteProduct, useProducts } from '../../api/products/queries';
import { useUnitsOfMeasure } from '../../api/units-of-measure/queries';
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
      { accessorKey: 'name', header: t('inventory.products.name') },
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
            return <span className="text-muted-foreground">{t('inventory.products.trackingNone')}</span>;
          }
          return (
            <Badge variant="secondary">
              {type === 'lot' ? t('inventory.products.trackingLot') : t('inventory.products.trackingSerial')}
            </Badge>
          );
        },
      },
      {
        id: 'trackVariants',
        header: t('inventory.products.variants'),
        accessorFn: (row: ProductDto) => row.trackVariants,
        cell: ({ row }: { row: Row<ProductDto> }) => (
          <Badge variant={row.original.trackVariants ? 'default' : 'secondary'}>
            {row.original.trackVariants ? t('common.yes') : t('common.no')}
          </Badge>
        ),
      },
      {
        id: 'isActive',
        header: t('common.status'),
        accessorFn: (row: ProductDto) => row.isActive,
        cell: ({ row }: { row: Row<ProductDto> }) => (
          <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
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
                <DropdownMenuItem onSelect={() => setEditing(row.original)}>{t('common.edit')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleDelete(row.original.id)}>
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Can>
        ),
      },
    ],
    [t, unitById],
  );

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t('inventory.products.subtitle')}</p>

      <DataTable
        columns={columns}
        data={products ?? []}
        isLoading={isLoading}
        toolbar={
          <div className="flex justify-end">
            <Can permission="inventory.manage">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">{t('inventory.products.newProduct')}</Button>
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

      <ProductVariantsDialog product={managingVariantsFor} onClose={() => setManagingVariantsFor(null)} />
    </div>
  );
}
