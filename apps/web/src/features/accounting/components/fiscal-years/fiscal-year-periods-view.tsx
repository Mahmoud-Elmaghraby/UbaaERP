import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Can,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';

import { useFiscalYearPeriods } from '../../api/fiscal-years/queries';
import { useClosePeriod, useReopenPeriod } from '../../api/accounting-periods/queries';
import { ApiError } from '../../../../lib/api-client';
import { PERIOD_STATUS_VARIANT, periodStatusLabelKey } from './fiscal-year-status';

/**
 * Read-only list + close/reopen actions per period — there is no create/delete for a
 * single accounting period (the whole set is generated once by FiscalYearsService.create(),
 * see AccountingPeriodsController's own class comment). Closing a period is what
 * JournalEntriesService.post() actually checks (AccountingPeriodsService.assertOpenForDate())
 * — a draft can still be created/edited for a closed period's dates, only posting is blocked.
 */
export function FiscalYearPeriodsView({ fiscalYearId }: { fiscalYearId: string }) {
  const { t } = useTranslation();
  const { data: periods, isLoading } = useFiscalYearPeriods(fiscalYearId);
  const closePeriod = useClosePeriod();
  const reopenPeriod = useReopenPeriod();

  async function handleToggle(id: string, status: 'open' | 'closed') {
    const mutation = status === 'open' ? closePeriod : reopenPeriod;
    const successKey =
      status === 'open'
        ? 'accounting.fiscalYears.periodCloseSuccess'
        : 'accounting.fiscalYears.periodReopenSuccess';
    const errorKey =
      status === 'open'
        ? 'accounting.fiscalYears.periodCloseError'
        : 'accounting.fiscalYears.periodReopenError';
    try {
      await mutation.mutateAsync(id);
      toast.success(t(successKey));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(errorKey));
    }
  }

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('accounting.fiscalYears.periodName')}</TableHead>
          <TableHead>{t('accounting.fiscalYears.periodStartDate')}</TableHead>
          <TableHead>{t('accounting.fiscalYears.periodEndDate')}</TableHead>
          <TableHead>{t('common.status')}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {(periods ?? []).map((period) => (
          <TableRow key={period.id}>
            <TableCell>{period.name}</TableCell>
            <TableCell>{period.startDate}</TableCell>
            <TableCell>{period.endDate}</TableCell>
            <TableCell>
              <Badge variant={PERIOD_STATUS_VARIANT[period.status]} dot>
                {t(periodStatusLabelKey(period.status))}
              </Badge>
            </TableCell>
            <TableCell>
              <Can permission="accounting.manage">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggle(period.id, period.status)}
                >
                  {period.status === 'open'
                    ? t('accounting.fiscalYears.closePeriod')
                    : t('accounting.fiscalYears.reopenPeriod')}
                </Button>
              </Can>
            </TableCell>
          </TableRow>
        ))}
        {(periods ?? []).length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
              {t('common.noResults')}
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
