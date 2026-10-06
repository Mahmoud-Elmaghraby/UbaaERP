import type { BadgeProps } from '@erp-platform/ui';
import type { AccountingPeriodStatus, FiscalYearStatus } from '@erp-platform/contracts';

export const FISCAL_YEAR_STATUS_VARIANT: Record<FiscalYearStatus, NonNullable<BadgeProps['variant']>> = {
  open: 'success',
  closed: 'neutral',
};

export function fiscalYearStatusLabelKey(status: FiscalYearStatus): string {
  return `accounting.fiscalYears.status.${status}`;
}

export const PERIOD_STATUS_VARIANT: Record<AccountingPeriodStatus, NonNullable<BadgeProps['variant']>> = {
  open: 'success',
  closed: 'neutral',
};

export function periodStatusLabelKey(status: AccountingPeriodStatus): string {
  return `accounting.fiscalYears.periodStatus.${status}`;
}
