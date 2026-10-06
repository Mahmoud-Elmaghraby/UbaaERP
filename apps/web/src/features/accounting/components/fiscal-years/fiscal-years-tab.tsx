import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { FiscalYearDto } from '@erp-platform/contracts';
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

import {
  useCloseFiscalYear,
  useDeleteFiscalYear,
  useFiscalYears,
  useReopenFiscalYear,
} from '../../api/fiscal-years/queries';
import { ApiError } from '../../../../lib/api-client';
import { CreateFiscalYearForm } from './fiscal-year-form';
import { FiscalYearPeriodsView } from './fiscal-year-periods-view';
import { FISCAL_YEAR_STATUS_VARIANT, fiscalYearStatusLabelKey } from './fiscal-year-status';

export function FiscalYearsTab() {
  const { t } = useTranslation();
  const { data: fiscalYears, isLoading } = useFiscalYears();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingPeriodsId, setViewingPeriodsId] = useState<string | null>(null);

  const closeFiscalYear = useCloseFiscalYear();
  const reopenFiscalYear = useReopenFiscalYear();
  const deleteFiscalYear = useDeleteFiscalYear();

  async function handleClose(id: string) {
    if (!window.confirm(t('accounting.fiscalYears.closeConfirm'))) return;
    try {
      await closeFiscalYear.mutateAsync(id);
      toast.success(t('accounting.fiscalYears.closeSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.fiscalYears.closeError'));
    }
  }

  async function handleReopen(id: string) {
    try {
      await reopenFiscalYear.mutateAsync(id);
      toast.success(t('accounting.fiscalYears.reopenSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.fiscalYears.reopenError'));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('accounting.fiscalYears.deleteConfirm'))) return;
    try {
      await deleteFiscalYear.mutateAsync(id);
      toast.success(t('accounting.fiscalYears.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.fiscalYears.deleteError'));
    }
  }

  const columns = useMemo<ColumnDef<FiscalYearDto>[]>(
    () => [
      { accessorKey: 'name', header: t('accounting.fiscalYears.name') },
      { accessorKey: 'startDate', header: t('accounting.fiscalYears.startDate') },
      { accessorKey: 'endDate', header: t('accounting.fiscalYears.endDate') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: FiscalYearDto) => row.status,
        cell: ({ row }: { row: Row<FiscalYearDto> }) => (
          <Badge variant={FISCAL_YEAR_STATUS_VARIANT[row.original.status]} dot>
            {t(fiscalYearStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<FiscalYearDto> }) => {
          const fiscalYear = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setViewingPeriodsId(fiscalYear.id)}>
                  {t('accounting.fiscalYears.viewPeriods')}
                </DropdownMenuItem>
                <Can permission="accounting.manage">
                  <>
                    {fiscalYear.status === 'open' ? (
                      <DropdownMenuItem onSelect={() => handleClose(fiscalYear.id)}>
                        {t('accounting.fiscalYears.close')}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => handleReopen(fiscalYear.id)}>
                        {t('accounting.fiscalYears.reopen')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => handleDelete(fiscalYear.id)}>
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
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Can permission="accounting.manage">
          <Button onClick={() => setCreateOpen(true)}>
            {t('accounting.fiscalYears.newFiscalYear')}
          </Button>
        </Can>
      </div>

      <DataTable columns={columns} data={fiscalYears ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('accounting.fiscalYears.newFiscalYear')}</DialogTitle>
          </DialogHeader>
          <CreateFiscalYearForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewingPeriodsId !== null}
        onOpenChange={(open) => !open && setViewingPeriodsId(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('accounting.fiscalYears.viewPeriods')}</DialogTitle>
          </DialogHeader>
          {viewingPeriodsId ? <FiscalYearPeriodsView fiscalYearId={viewingPeriodsId} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
