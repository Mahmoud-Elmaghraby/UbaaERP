import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { RecurringEntryDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, EmptyState, PageHeader, toast } from '@erp-platform/ui';
import { Play, Plus, Repeat } from 'lucide-react';

import { useGenerateRecurringEntries, useRecurringEntries } from '../../api/accounting-completion/queries';
import { ApiError } from '../../../../lib/api-client';
import { formatDate } from '../../../../lib/format-date';
import { Amount } from '../../../../components/amount';
import { useBaseCurrency } from '../../../settings/queries';

function templateTotal(entry: RecurringEntryDto): string {
  return entry.lines.reduce((sum, line) => sum + BigInt(line.debitAmountMinorUnits), 0n).toString();
}

/** القيود المتكررة — templates that make an entry every month / quarter / year. */
export function RecurringEntriesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currency = useBaseCurrency();
  const { data, isLoading } = useRecurringEntries();
  const generate = useGenerateRecurringEntries();

  const columns = useMemo<ColumnDef<RecurringEntryDto>[]>(
    () => [
      { accessorKey: 'name', header: t('accounting.recurring.name'), cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      {
        accessorKey: 'frequency',
        header: t('accounting.recurring.frequency'),
        cell: ({ row }) => t(`accounting.recurring.frequencies.${row.original.frequency}`),
      },
      {
        id: 'amount',
        header: t('accounting.recurring.amount'),
        accessorFn: templateTotal,
        cell: ({ row }) => <Amount value={templateTotal(row.original)} currency={currency} />,
      },
      {
        accessorKey: 'nextRunDate',
        header: t('accounting.recurring.nextRun'),
        cell: ({ row }) => (row.original.isActive ? <span className="tabular-nums">{formatDate(row.original.nextRunDate)}</span> : '—'),
      },
      {
        id: 'mode',
        header: t('accounting.recurring.mode'),
        accessorFn: (row) => row.autoPost,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {t(row.original.autoPost ? 'accounting.recurring.autoPostShort' : 'accounting.recurring.draftShort')}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('common.status'),
        accessorFn: (row) => row.isActive,
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'success' : 'secondary'} dot>
            {t(row.original.isActive ? 'common.active' : 'common.inactive')}
          </Badge>
        ),
      },
    ],
    [t, currency],
  );

  async function runNow() {
    try {
      const { made } = await generate.mutateAsync();
      toast.success(made > 0 ? t('accounting.recurring.generated', { count: made }) : t('accounting.recurring.nothingDue'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('accounting.tabs.recurring')}
        description={t('accounting.recurring.subtitle')}
        actions={
          <Can permission="accounting.manage">
            <Button variant="outline" onClick={runNow} disabled={generate.isPending}>
              <Play className="me-1 h-4 w-4" />
              {t('accounting.recurring.runNow')}
            </Button>
            <Button asChild>
              <Link to="/accounting/recurring-entries/new">
                <Plus className="me-1 h-4 w-4" />
                {t('accounting.recurring.new')}
              </Link>
            </Button>
          </Can>
        }
      />
      {!isLoading && data?.length === 0 ? (
        <EmptyState icon={<Repeat />} title={t('accounting.recurring.emptyTitle')} description={t('accounting.recurring.emptyHint')} />
      ) : (
        <DataTable
          columns={columns}
          data={data ?? []}
          isLoading={isLoading}
          searchable
          onRowClick={(row) => navigate(`/accounting/recurring-entries/${row.id}`)}
        />
      )}
    </div>
  );
}
