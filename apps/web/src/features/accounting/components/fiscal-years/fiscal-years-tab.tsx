import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AccountingPeriodDto, FiscalYearDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Skeleton,
  cn,
  toast,
} from '@erp-platform/ui';
import { CalendarRange, Lock, LockOpen, Plus } from 'lucide-react';

import {
  useCloseFiscalYear,
  useDeleteFiscalYear,
  useFiscalYearPeriods,
  useFiscalYears,
  useReopenFiscalYear,
} from '../../api/fiscal-years/queries';
import { useClosePeriod, useReopenPeriod } from '../../api/accounting-periods/queries';
import { ApiError } from '../../../../lib/api-client';
import { formatDate, todayIso } from '../../../../lib/format-date';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { CreateFiscalYearForm } from './fiscal-year-form';
import { FISCAL_YEAR_STATUS_VARIANT, fiscalYearStatusLabelKey } from './fiscal-year-status';

/**
 * Fiscal years as cards, newest first, each with its months inline: a
 * month opens/closes with one click, and closing the year (once every
 * month is closed) posts the year-end closing entry into retained earnings.
 */
export function FiscalYearsTab() {
  const { t } = useTranslation();
  const { data: years, isLoading } = useFiscalYears();
  const [createOpen, setCreateOpen] = useState(false);
  const sorted = [...(years ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Can permission="accounting.manage">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="me-1 h-4 w-4" />
            {t('accounting.fiscalYears.newFiscalYear')}
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<CalendarRange />}
          title={t('accounting.fiscalYears.emptyTitle')}
          description={t('accounting.fiscalYears.emptyHint')}
        />
      ) : (
        sorted.map((year) => <FiscalYearCard key={year.id} year={year} />)
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('accounting.fiscalYears.newFiscalYear')}</DialogTitle>
          </DialogHeader>
          <CreateFiscalYearForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FiscalYearCard({ year }: { year: FiscalYearDto }) {
  const { t } = useTranslation();
  const { data: periods, isLoading } = useFiscalYearPeriods(year.id);
  const closeYear = useCloseFiscalYear();
  const reopenYear = useReopenFiscalYear();
  const deleteYear = useDeleteFiscalYear();
  const closePeriod = useClosePeriod();
  const reopenPeriod = useReopenPeriod();
  const [busy, setBusy] = useState(false);

  const today = todayIso();
  const openCount = (periods ?? []).filter((p) => p.status === 'open').length;
  const yearClosed = year.status === 'closed';

  async function run(action: () => Promise<unknown>, success: string, error: string) {
    setBusy(true);
    try {
      await action();
      toast.success(t(success));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(error));
    } finally {
      setBusy(false);
    }
  }

  async function togglePeriod(period: AccountingPeriodDto) {
    if (yearClosed) return;
    if (period.status === 'open') {
      if (!(await confirmDialog(t('accounting.fiscalYears.closePeriodConfirm', { name: period.name })))) return;
      await run(() => closePeriod.mutateAsync(period.id), 'accounting.fiscalYears.periodCloseSuccess', 'accounting.fiscalYears.periodCloseError');
    } else {
      await run(() => reopenPeriod.mutateAsync(period.id), 'accounting.fiscalYears.periodReopenSuccess', 'accounting.fiscalYears.periodReopenError');
    }
  }

  async function closeAllAndYear() {
    if (!(await confirmDialog(t('accounting.fiscalYears.closeYearConfirm', { name: year.name }), { tone: 'danger' }))) return;
    await run(
      async () => {
        for (const period of periods ?? []) {
          if (period.status === 'open') await closePeriod.mutateAsync(period.id);
        }
        await closeYear.mutateAsync(year.id);
      },
      'accounting.fiscalYears.closeSuccess',
      'accounting.fiscalYears.closeError',
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">{year.name}</h2>
          <Badge variant={FISCAL_YEAR_STATUS_VARIANT[year.status]} dot>
            {t(fiscalYearStatusLabelKey(year.status))}
          </Badge>
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatDate(year.startDate)} – {formatDate(year.endDate)}
          </span>
        </div>
        <Can permission="accounting.manage">
          <div className="flex gap-2">
            {yearClosed ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  if (!(await confirmDialog(t('accounting.fiscalYears.reopenYearConfirm', { name: year.name }), { tone: 'danger' }))) return;
                  await run(() => reopenYear.mutateAsync(year.id), 'accounting.fiscalYears.reopenSuccess', 'accounting.fiscalYears.reopenError');
                }}
              >
                <LockOpen className="me-1 h-4 w-4" />
                {t('accounting.fiscalYears.reopen')}
              </Button>
            ) : (
              <>
                {openCount === (periods?.length ?? 0) && year.endDate > today ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      if (!(await confirmDialog(t('accounting.fiscalYears.deleteConfirm'), { tone: 'danger' }))) return;
                      await run(() => deleteYear.mutateAsync(year.id), 'accounting.fiscalYears.deleteSuccess', 'accounting.fiscalYears.deleteError');
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                ) : null}
                <Button size="sm" disabled={busy || isLoading} onClick={closeAllAndYear}>
                  <Lock className="me-1 h-4 w-4" />
                  {t('accounting.fiscalYears.closeYear')}
                </Button>
              </>
            )}
          </div>
        </Can>
      </header>

      <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4 lg:grid-cols-6">
        {isLoading
          ? Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
          : (periods ?? []).map((period) => {
              const current = period.startDate <= today && today <= period.endDate;
              const open = period.status === 'open';
              return (
                <button
                  key={period.id}
                  type="button"
                  disabled={yearClosed || busy}
                  onClick={() => togglePeriod(period)}
                  title={open ? t('accounting.fiscalYears.closePeriod') : t('accounting.fiscalYears.reopenPeriod')}
                  className={cn(
                    'flex flex-col items-start rounded-lg border px-3 py-2 text-start transition-colors disabled:cursor-default',
                    open ? 'bg-card hover:border-primary/50' : 'bg-muted/60 text-muted-foreground',
                    current && 'ring-2 ring-primary/40',
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-1 text-sm font-medium">
                    {period.name}
                    {open ? <LockOpen className="h-3.5 w-3.5 text-success" /> : <Lock className="h-3.5 w-3.5" />}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(`accounting.fiscalYears.periodStatus.${period.status}`)}
                  </span>
                </button>
              );
            })}
      </div>
      {yearClosed ? (
        <p className="border-t bg-muted/30 px-5 py-2.5 text-xs text-muted-foreground">{t('accounting.fiscalYears.closedHint')}</p>
      ) : null}
    </section>
  );
}
