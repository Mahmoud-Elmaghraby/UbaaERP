import { useTranslation } from 'react-i18next';
import type { PosSessionDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Separator,
  Skeleton,
} from '@erp-platform/ui';

import { usePosSessionReport } from '../../api/pos/queries';
import { formatMoney } from '../../../../lib/money';

/**
 * POS Stage 5 (claude/sales-pos-research.md) — X Report while the session is open,
 * Z Report once it's closed; same dialog, same data shape either way (the backend
 * decides what's live vs stored — see PosSessionsService.getReport()'s own comment).
 * Read-only: opening this dialog never mutates the session, so it's safe to open any
 * number of times mid-shift.
 */
export function PosSessionReportDialog({ session }: { session: PosSessionDto }) {
  const { t } = useTranslation();
  const { data: report, isLoading, isFetching, refetch } = usePosSessionReport(session.id);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">{t('pos.report.trigger')}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t(session.status === 'closed' ? 'pos.report.titleZ' : 'pos.report.titleX')}
            <Badge variant={session.status === 'closed' ? 'secondary' : 'default'}>
              {t(session.status === 'closed' ? 'pos.session.closed' : 'pos.session.open')}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {isLoading || !report ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="grid gap-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">{t('pos.report.salesCount')}</p>
                <p className="font-medium">{report.salesCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('pos.report.totalSalesAmount')}</p>
                <p className="font-medium">
                  {formatMoney(report.totalSalesAmount.amountMinorUnits, report.totalSalesAmount.currency)}
                </p>
              </div>
            </div>

            <Separator />
            <p className="font-medium text-muted-foreground">{t('pos.report.tendersByMethodTitle')}</p>
            {report.tendersByMethod.length === 0 ? (
              <p className="text-muted-foreground">{t('pos.report.noTenders')}</p>
            ) : (
              <div className="grid gap-1">
                {report.tendersByMethod.map((tender) => (
                  <div key={tender.paymentMethod} className="flex justify-between">
                    <span>{t(`sales.paymentsReceived.paymentMethodValue.${tender.paymentMethod}`)}</span>
                    <span>{formatMoney(tender.amount.amountMinorUnits, tender.amount.currency)}</span>
                  </div>
                ))}
              </div>
            )}

            <Separator />
            <p className="font-medium text-muted-foreground">{t('pos.report.cashSummaryTitle')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted-foreground">{t('pos.openSession.openingCashAmount')}</p>
                <p className="font-medium">
                  {formatMoney(session.openingCashAmount.amountMinorUnits, session.openingCashAmount.currency)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('pos.closeSession.expectedCashAmount')}</p>
                <p className="font-medium">
                  {formatMoney(report.expectedCashAmount.amountMinorUnits, report.expectedCashAmount.currency)}
                </p>
              </div>
              {report.countedCashAmount ? (
                <div>
                  <p className="text-muted-foreground">{t('pos.closeSession.countedCashAmount')}</p>
                  <p className="font-medium">
                    {formatMoney(report.countedCashAmount.amountMinorUnits, report.countedCashAmount.currency)}
                  </p>
                </div>
              ) : null}
              {report.varianceAmount ? (
                <div>
                  <p className="text-muted-foreground">{t('pos.closeSession.varianceAmount')}</p>
                  <p className="font-medium">
                    {formatMoney(report.varianceAmount.amountMinorUnits, report.varianceAmount.currency)}
                  </p>
                </div>
              ) : null}
            </div>

            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {t('pos.report.generatedAt')}: {new Date(report.generatedAt).toLocaleString('ar-EG')}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                {t('pos.report.refresh')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
