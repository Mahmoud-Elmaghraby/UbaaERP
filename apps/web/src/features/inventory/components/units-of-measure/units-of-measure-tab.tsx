import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { UnitOfMeasureDto } from '@erp-platform/contracts';
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

import { useDeleteUnitOfMeasure, useUnitsOfMeasure } from '../../api/units-of-measure/queries';
import { CreateUnitOfMeasureForm, EditUnitOfMeasureForm } from './unit-form';
import { UnitConverter } from './unit-converter';
import { ApiError } from '../../../../lib/api-client';

export function UnitsOfMeasureTab() {
  const { t } = useTranslation();
  const { data: units, isLoading } = useUnitsOfMeasure();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UnitOfMeasureDto | null>(null);
  const deleteUnit = useDeleteUnitOfMeasure();

  const unitById = new Map((units ?? []).map((unit) => [unit.id, unit]));

  async function handleDelete(id: string) {
    if (!window.confirm(t('inventory.unitsOfMeasure.deleteConfirm'))) return;
    try {
      await deleteUnit.mutateAsync(id);
      toast.success(t('inventory.unitsOfMeasure.deleteSuccess'));
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
              <Button>{t('inventory.unitsOfMeasure.newUnit')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('inventory.unitsOfMeasure.newUnit')}</DialogTitle>
              </DialogHeader>
              <CreateUnitOfMeasureForm units={units ?? []} onDone={() => setCreateOpen(false)} />
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
                <TableHead>{t('inventory.unitsOfMeasure.name')}</TableHead>
                <TableHead>{t('inventory.unitsOfMeasure.symbol')}</TableHead>
                <TableHead>{t('inventory.unitsOfMeasure.baseUnit')}</TableHead>
                <TableHead>{t('inventory.unitsOfMeasure.conversionFactor')}</TableHead>
                <TableHead>{t('common.active')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(units ?? []).map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell className="font-medium">{unit.name}</TableCell>
                  <TableCell>{unit.symbol}</TableCell>
                  <TableCell>
                    {unit.baseUnitId ? (
                      (unitById.get(unit.baseUnitId)?.name ?? '-')
                    ) : (
                      <Badge variant="secondary">
                        {t('inventory.unitsOfMeasure.baseUnitBadge')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{unit.baseUnitId ? unit.conversionFactor : '-'}</TableCell>
                  <TableCell>
                    <Badge variant={unit.isActive ? 'success' : 'neutral'} dot>
                      {unit.isActive ? t('common.active') : t('common.inactive')}
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
                          <DropdownMenuItem onSelect={() => setEditing(unit)}>
                            {t('common.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleDelete(unit.id)}>
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Can>
                  </TableCell>
                </TableRow>
              ))}
              {(units ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
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
            <EditUnitOfMeasureForm
              units={units ?? []}
              unit={editing}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <UnitConverter units={units ?? []} />
    </div>
  );
}
