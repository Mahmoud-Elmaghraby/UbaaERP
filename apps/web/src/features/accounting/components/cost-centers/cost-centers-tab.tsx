import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { CostCenterDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@erp-platform/ui';

import { useCostCenters, useDeleteCostCenter } from '../../api/cost-centers/queries';
import { ApiError } from '../../../../lib/api-client';
import { CreateCostCenterForm, EditCostCenterForm } from './cost-center-form';

export function CostCentersTab() {
  const { t } = useTranslation();
  const { data: costCenters, isLoading } = useCostCenters();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CostCenterDto | null>(null);
  const deleteCostCenter = useDeleteCostCenter();

  async function handleDelete(id: string) {
    if (!window.confirm(t('accounting.costCenters.deleteConfirm'))) return;
    try {
      await deleteCostCenter.mutateAsync(id);
      toast.success(t('accounting.costCenters.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.costCenters.deleteError'));
    }
  }

  const columns = useMemo<ColumnDef<CostCenterDto>[]>(
    () => [
      { accessorKey: 'code', header: t('accounting.costCenters.code') },
      { accessorKey: 'name', header: t('accounting.costCenters.name') },
      {
        id: 'isActive',
        header: t('common.status'),
        cell: ({ row }: { row: Row<CostCenterDto> }) => (
          <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
            {t(row.original.isActive ? 'common.active' : 'common.inactive')}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<CostCenterDto> }) => {
          const costCenter = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <Can permission="accounting.manage">
                  <>
                    <DropdownMenuItem onSelect={() => setEditing(costCenter)}>
                      {t('common.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleDelete(costCenter.id)}>
                      {t('common.delete')}
                    </DropdownMenuItem>
                  </>
                </Can>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('accounting.costCenters.subtitle')}</p>
        <Can permission="accounting.manage">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            {t('accounting.costCenters.newCostCenter')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={costCenters ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('accounting.costCenters.newCostCenter')}</DialogTitle>
          </DialogHeader>
          <CreateCostCenterForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('accounting.costCenters.editCostCenter')}</DialogTitle>
          </DialogHeader>
          {editing ? <EditCostCenterForm costCenter={editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
