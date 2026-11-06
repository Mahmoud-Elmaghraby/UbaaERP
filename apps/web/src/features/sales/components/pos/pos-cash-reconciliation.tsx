import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PosSessionReportDto } from '@erp-platform/contracts';
import { cn } from '@erp-platform/ui';

import { Amount } from '../../../../components/amount';

function Row({ label, children, strong, tone }: { label: ReactNode; children: ReactNode; strong?: boolean; tone?: 'in' | 'out' }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-2', strong && 'border-t pt-2 font-semibold')}>
      <span className={cn(!strong && 'text-muted-foreground')}>
        {tone === 'in' ? '+ ' : tone === 'out' ? '− ' : ''}
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * The drawer's cash, line by line: opening + cash sales − cash refunds +
 * cash in − cash out = expected. `blind` hides expected / counted / variance
 * (the close dialog asks for the count before showing what was expected).
 */
export function PosCashReconciliation({ report, blind = false }: { report: PosSessionReportDto; blind?: boolean }) {
  const { t } = useTranslation();
  const currency = report.expectedCashAmount.currency;
  const cashSales = report.tendersByMethod.find((row) => row.paymentMethod === 'cash')?.amount.amountMinorUnits ?? '0';

  return (
    <div className="grid gap-1.5 text-sm">
      <Row label={t('pos.openSession.openingCashAmount')}>
        <Amount value={report.session.openingCashAmount.amountMinorUnits} currency={currency} />
      </Row>
      <Row label={t('pos.report.cashSales')} tone="in">
        <Amount value={cashSales} currency={currency} zeroAsDash />
      </Row>
      <Row label={t('pos.report.cashRefunds')} tone="out">
        <Amount value={report.cashRefundsAmount.amountMinorUnits} currency={currency} zeroAsDash />
      </Row>
      <Row label={t('pos.report.cashIn')} tone="in">
        <Amount value={report.cashInAmount.amountMinorUnits} currency={currency} zeroAsDash />
      </Row>
      <Row label={t('pos.report.cashOut')} tone="out">
        <Amount value={report.cashOutAmount.amountMinorUnits} currency={currency} zeroAsDash />
      </Row>
      {!blind ? (
        <>
          <Row label={t('pos.closeSession.expectedCashAmount')} strong>
            <Amount value={report.expectedCashAmount.amountMinorUnits} currency={currency} className="text-base" />
          </Row>
          {report.countedCashAmount ? (
            <Row label={t('pos.closeSession.countedCashAmount')}>
              <Amount value={report.countedCashAmount.amountMinorUnits} currency={currency} />
            </Row>
          ) : null}
          {report.varianceAmount ? (
            <Row label={t('pos.closeSession.varianceAmount')}>
              <Amount
                value={report.varianceAmount.amountMinorUnits}
                currency={currency}
                className={cn('font-semibold', report.varianceAmount.amountMinorUnits === '0' ? 'text-success' : 'text-danger')}
              />
            </Row>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
