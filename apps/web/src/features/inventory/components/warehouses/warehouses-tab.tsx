import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { WarehouseDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';

import { useBranches } from '../../../settings/queries';
import { useDeleteWarehouse, useWarehouses } from '../../api/warehouses/queries';
import { CreateWarehouseForm, EditWarehouseForm } from './warehouse-form';
import { WarehouseLocationsDialog } from './warehouse-locations-dialog';
import { ApiError } from '../../../../lib/api-client';

export function WarehousesTab() {
  const { t } = useTranslation();
  const { data: warehouses, isLoading } = useWarehouses();
  const { data: branches } = useBranches();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseDto | null>(null);
  const [managingLocationsFor, setManagingLocationsFor] = useState<WarehouseDto | null>(null);
  const deleteWarehouse = useDeleteWarehouse();

  const branchById = new Map((branches ?? []).map((branch) => [branch.id, branch]));

  async function handleDelete(id: string) {
    if (!window.confirm(t('inventory.warehouses.deleteConfirm'))) return;
    try {
      await deleteWarehouse.mutateAsync(id);
      toast.success(t('inventory.warehouses.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-end gap-3">
        <Can permission="inventory.manage">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>{t('inventory.warehouses.newWarehouse')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('inventory.warehouses.newWarehouse')}</DialogTitle>
              </DialogHeader>
              <CreateWarehouseForm onDone={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </Can>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('inventory.warehouses.name')}</TableHead>
                <TableHead>{t('inventory.warehouses.code')}</TableHead>
                <TableHead>{t('inventory.warehouses.branch')}</TableHead>
                <TableHead>{t('common.active')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(warehouses ?? []).map((warehouse) => (
                <TableRow key={warehouse.id}>
                  <TableCell className="font-medium">{warehouse.name}</TableCell>
                  <TableCell>{warehouse.code}</TableCell>
                  <TableCell>
                    {warehouse.branchId
                      ? (branchById.get(warehouse.branchId)?.name ?? '-')
                      : t('inventory.warehouses.noBranch')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={warehouse.isActive ? 'success' : 'neutral'} dot>
                      {warehouse.isActive ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Can permission="inventory.manage">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setManagingLocationsFor(warehouse)}>
                            {t('inventory.warehouses.manageLocations')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setEditing(warehouse)}>
                            {t('common.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleDelete(warehouse.id)}>
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Can>
                  </TableCell>
                </TableRow>
              ))}
              {(warehouses ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    {t('common.noResults')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <EditWarehouseForm warehouse={editing} onDone={() => setEditing(null)} />
          ) : null}
        </DialogContent>
      </Dialog>

      <WarehouseLocationsDialog
        warehouse={managingLocationsFor}
        onClose={() => setManagingLocationsFor(null)}
      />
    </div>
  );
}
