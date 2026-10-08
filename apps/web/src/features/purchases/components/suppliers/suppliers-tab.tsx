import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { SupplierDto } from '@erp-platform/contracts';
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

import { useDeleteSupplier, useSuppliers } from '../../api/suppliers/queries';
import { CreateSupplierForm, EditSupplierForm } from './supplier-form';
import { ApiError } from '../../../../lib/api-client';

export function SuppliersTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: suppliers, isLoading } = useSuppliers();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierDto | null>(null);
  const deleteSupplier = useDeleteSupplier();

  async function handleDelete(id: string) {
    if (!window.confirm(t('purchases.suppliers.deleteConfirm'))) return;
    try {
      await deleteSupplier.mutateAsync(id);
      toast.success(t('purchases.suppliers.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const columns = useMemo<ColumnDef<SupplierDto>[]>(
    () => [
      { accessorKey: 'code', header: t('purchases.suppliers.code') },
      { accessorKey: 'name', header: t('purchases.suppliers.name') },
      {
        id: 'contactPerson',
        header: t('purchases.suppliers.contactPerson'),
        accessorFn: (row: SupplierDto) => row.contactPerson ?? '—',
      },
      {
        id: 'phone',
        header: t('purchases.suppliers.phone'),
        accessorFn: (row: SupplierDto) => row.phone ?? '—',
      },
      { accessorKey: 'defaultCurrency', header: t('purchases.suppliers.defaultCurrency') },
      {
        id: 'isActive',
        header: t('common.status'),
        accessorFn: (row: SupplierDto) => row.isActive,
        cell: ({ row }: { row: Row<SupplierDto> }) => (
          <Badge variant={row.original.isActive ? 'success' : 'neutral'} dot>
            {row.original.isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<SupplierDto> }) => (
          <Can permission="purchases.manage">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => navigate(`/purchases/suppliers/${row.original.id}/statement`)}>
                  {t('statements.title')}
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
    [t, navigate],
  );

  return (
    <div className="grid gap-4">
      <DataTable
        columns={columns}
        data={suppliers ?? []}
        isLoading={isLoading}
        toolbar={
          <div className="flex justify-end">
            <Can permission="purchases.manage">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button>{t('purchases.suppliers.newSupplier')}</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{t('purchases.suppliers.newSupplier')}</DialogTitle>
                  </DialogHeader>
                  <CreateSupplierForm onDone={() => setCreateOpen(false)} />
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
          {editing ? <EditSupplierForm supplier={editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
