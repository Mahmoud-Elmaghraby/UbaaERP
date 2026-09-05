/**
 * Fiscal year (CLAUDE.md §10 — step 5, Accounting, Stage 1). Owns a set
 * of accounting_periods, generated automatically at create time — see
 * migration 0049_create_fiscal_years and period-generator.ts.
 *
 * startDate/endDate are plain 'YYYY-MM-DD' strings, matching the
 * date-only-column convention used everywhere else in this codebase
 * (e.g. quotations.validUntilDate) — never a JS Date across a layer
 * boundary.
 */
export type FiscalYearStatus = 'open' | 'closed';

export interface FiscalYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: FiscalYearStatus;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFiscalYearInput {
  name: string;
  startDate: string;
  endDate: string;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

export interface UpdateFiscalYearInput {
  name?: string;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}
