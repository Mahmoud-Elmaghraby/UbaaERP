import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { JournalEntryDto, JournalEntryStatus } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader, cn } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { useJournalEntries, type JournalEntryFilters } from '../../api/journal-entries/queries';
import { formatDate } from '../../../../lib/format-date';
import { JOURNAL_ENTRY_STATUS_VARIANT, journalEntryStatusLabelKey, sourceRefKey } from './journal-entry-status';

const STATUS_TABS: Array<JournalEntryStatus | 'all'> = ['all', 'draft', 'posted', 'cancelled'];

/** القيود اليومية — status tabs, search, a row opens the entry's page. */
export function JournalEntriesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as JournalEntryStatus | null) ?? 'all';
  const filters = useMemo<JournalEntryFilters>(() => (status === 'all' ? {} : { status }), [status]);
  const { data: entries, isLoading } = useJournalEntries(filters);

  const columns = useMemo<ColumnDef<JournalEntryDto>[]>(
    () => [
      {
        accessorKey: 'entryNumber',
        header: t('accounting.journalEntries.entryNumber'),
        cell: ({ row }) => <span className="font-medium">{row.original.entryNumber}</span>,
      },
      {
        accessorKey: 'entryDate',
        header: t('accounting.journalEntries.entryDate'),
        cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.entryDate)}</span>,
      },
      {
        accessorKey: 'description',
        header: t('accounting.journalEntries.description'),
        cell: ({ row }) => <span className="line-clamp-1">{row.original.description ?? '—'}</span>,
      },
      {
        id: 'source',
        header: t('accounting.journalEntries.source'),
        accessorFn: (row) =>
          row.sourceReferenceType
            ? t(`accounting.journalEntries.sourceRef.${sourceRefKey(row.sourceReferenceType)}`, {
                defaultValue: t(`accounting.journalEntries.sourceValue.${row.source}`),
              })
            : t(`accounting.journalEntries.sourceValue.${row.source}`),
        cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue())}</span>,
      },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => row.status,
        cell: ({ row }) => (
          <Badge variant={JOURNAL_ENTRY_STATUS_VARIANT[row.original.status]} dot>
            {t(journalEntryStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('accounting.tabs.journalEntries')}
        description={t('accounting.journalEntries.subtitle')}
        actions={
          <Can permission="accounting.manage">
            <Button asChild>
              <Link to="/accounting/journal-entries/new">
                <Plus className="me-1 h-4 w-4" />
                {t('accounting.journalEntries.newEntry')}
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={entries ?? []}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('accounting.journalEntries.search')}
        onRowClick={(entry) => navigate(`/accounting/journal-entries/${entry.id}`)}
        toolbar={
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  status === tab ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab === 'all' ? t('accounting.journalEntries.allStatuses') : t(journalEntryStatusLabelKey(tab))}
              </button>
            ))}
          </div>
        }
      />
    </div>
  );
}
