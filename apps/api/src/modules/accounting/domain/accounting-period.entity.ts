/**
 * Accounting period (CLAUDE.md §10 — step 5, Accounting, Stage 1). One
 * month-shaped slice of a fiscal year. No standalone create — the whole
 * set for a fiscal year is generated in FiscalYearsService.create()
 * (see period-generator.ts); no standalone delete either, since a
 * period's lifecycle is entirely owned by its fiscal year.
 */
export type AccountingPeriodStatus = 'open' | 'closed';

export interface AccountingPeriod {
  id: string;
  fiscalYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: AccountingPeriodStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAccountingPeriodInput {
  fiscalYearId: string;
  name: string;
  startDate: string;
  endDate: string;
}
