import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { JournalEntryDto, JournalEntryStatus } from '@erp-platform/contracts';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@erp-platform/ui';

import {
  useCancelJournalEntry,
  useDeleteJournalEntry,
  useJournalEntries,
  useJournalEntry,
  usePostJournalEntry,
  type JournalEntryFilters,
} from '../../api/journal-entries/queries';
import { ApiError } from '../../../../lib/api-client';
import { CreateJournalEntryForm, EditJournalEntryForm } from './journal-entry-form';
import { JournalEntryDetailsView } from './journal-entry-details-view';
import { ReverseJournalEntryForm } from './journal-entry-reverse-form';
import { JOURNAL_ENTRY_STATUS_VARIANT, journalEntryStatusLabelKey } from './journal-entry-status';

const STATUS_FILTERS: Array<JournalEntryStatus | '__all__'> = ['__all__', 'draft', 'posted', 'cancelled'];

export function JournalEntriesTab() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<JournalEntryStatus | '__all__'>('__all__');
  const filters = useMemo<JournalEntryFilters>(
    () => (statusFilter === '__all__' ? {} : { status: statusFilter }),
    [statusFilter],
  );
  const { data: entries, isLoading } = useJournalEntries(filters);

  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);

  const { data: viewingEntry, isLoading: viewingLoading } = useJournalEntry(viewingId);
  const { data: editingEntry, isLoading: editingLoading } = useJournalEntry(editingId);

  const postEntry = usePostJournalEntry();
  const cancelEntry = useCancelJournalEntry();
  const deleteEntry = useDeleteJournalEntry();

  async function handlePost(id: string) {
    if (!window.confirm(t('accounting.journalEntries.postConfirm'))) return;
    try {
      await postEntry.mutateAsync(id);
      toast.success(t('accounting.journalEntries.postSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.journalEntries.postError'));
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm(t('accounting.journalEntries.cancelConfirm'))) return;
    try {
      await cancelEntry.mutateAsync(id);
      toast.success(t('accounting.journalEntries.cancelSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.journalEntries.cancelError'));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('accounting.journalEntries.deleteConfirm'))) return;
    try {
      await deleteEntry.mutateAsync(id);
      toast.success(t('accounting.journalEntries.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.journalEntries.deleteError'));
    }
  }

  const columns = useMemo<ColumnDef<JournalEntryDto>[]>(
    () => [
      { accessorKey: 'entryNumber', header: t('accounting.journalEntries.entryNumber') },
      { accessorKey: 'entryDate', header: t('accounting.journalEntries.entryDate') },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row: JournalEntryDto) => row.status,
        cell: ({ row }: { row: Row<JournalEntryDto> }) => (
          <Badge variant={JOURNAL_ENTRY_STATUS_VARIANT[row.original.status]}>
            {t(journalEntryStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: 'source',
        header: t('accounting.journalEntries.source'),
        accessorFn: (row: JournalEntryDto) => t(`accounting.journalEntries.sourceValue.${row.source}`),
      },
      { accessorKey: 'description', header: t('accounting.journalEntries.description') },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: Row<JournalEntryDto> }) => {
          const entry = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setViewingId(entry.id)}>
                  {t('accounting.journalEntries.viewDetails')}
                </DropdownMenuItem>
                <Can permission="accounting.manage">
                  <>
                    {entry.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => setEditingId(entry.id)}>
                        {t('common.edit')}
                      </DropdownMenuItem>
                    ) : null}
                    {entry.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handlePost(entry.id)}>
                        {t('accounting.journalEntries.post')}
                      </DropdownMenuItem>
                    ) : null}
                    {entry.status === 'draft' ? (
                      <DropdownMenuItem onSelect={() => handleCancel(entry.id)}>
                        {t('accounting.journalEntries.cancel')}
                      </DropdownMenuItem>
                    ) : null}
                    {entry.status === 'posted' ? (
                      <DropdownMenuItem onSelect={() => setReversingId(entry.id)}>
                        {t('accounting.journalEntries.reverse')}
                      </DropdownMenuItem>
                    ) : null}
                    {entry.status === 'draft' || entry.status === 'cancelled' ? (
                      <DropdownMenuItem onSelect={() => handleDelete(entry.id)}>
                        {t('common.delete')}
                      </DropdownMenuItem>
                    ) : null}
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
        <p className="text-sm text-muted-foreground">{t('accounting.journalEntries.subtitle')}</p>
        <Can permission="accounting.manage">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            {t('accounting.journalEntries.newEntry')}
          </Button>
        </Can>
      </div>

      <div className="w-48">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as JournalEntryStatus | '__all__')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((status) => (
              <SelectItem key={status} value={status}>
                {status === '__all__'
                  ? t('accounting.journalEntries.allStatuses')
                  : t(journalEntryStatusLabelKey(status))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={entries ?? []} isLoading={isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('accounting.journalEntries.newEntry')}</DialogTitle>
          </DialogHeader>
          <CreateJournalEntryForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
          </DialogHeader>
          {editingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {editingEntry ? (
            <EditJournalEntryForm entry={editingEntry} onDone={() => setEditingId(null)} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={reversingId !== null} onOpenChange={(open) => !open && setReversingId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('accounting.journalEntries.reverse')}</DialogTitle>
          </DialogHeader>
          {reversingId ? (
            <ReverseJournalEntryForm entryId={reversingId} onDone={() => setReversingId(null)} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('accounting.journalEntries.viewDetails')}</DialogTitle>
          </DialogHeader>
          {viewingLoading ? <Skeleton className="h-40 w-full" /> : null}
          {viewingEntry ? <JournalEntryDetailsView entry={viewingEntry} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
