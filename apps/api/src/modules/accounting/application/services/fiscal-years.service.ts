import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { FISCAL_YEAR_REPOSITORY, type FiscalYearRepository } from '../ports/fiscal-year.repository';
import { ACCOUNTING_PERIOD_REPOSITORY, type AccountingPeriodRepository } from '../ports/accounting-period.repository';
import type { FiscalYear, CreateFiscalYearInput, UpdateFiscalYearInput } from '../../domain/fiscal-year.entity';
import { BusinessRuleError, NotFoundError } from '../errors';
import { generateMonthlyPeriods } from './period-generator';

/**
 * Fiscal years (CLAUDE.md §10 — step 5, Accounting, Stage 1). Not in the
 * master doc's own §16.6 entity list — added as necessary supporting
 * plumbing for journal_entries (Stage 2), see migration
 * 0049_create_fiscal_years for the full reasoning.
 *
 * create() auto-generates one accounting_period per calendar month
 * spanning the fiscal year, in the same transaction — there is no
 * standalone "create a period" endpoint (AccountingPeriodsService only
 * lists/closes/reopens).
 */
@Injectable()
export class FiscalYearsService {
  constructor(
    @Inject(FISCAL_YEAR_REPOSITORY) private readonly fiscalYears: FiscalYearRepository,
    @Inject(ACCOUNTING_PERIOD_REPOSITORY) private readonly periods: AccountingPeriodRepository,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<FiscalYear[]> {
    return this.fiscalYears.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<FiscalYear> {
    const fiscalYear = await this.fiscalYears.findById(db, id);
    if (!fiscalYear) throw new NotFoundError(`Fiscal year "${id}" not found.`);
    return fiscalYear;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateFiscalYearInput): Promise<FiscalYear> {
    if (input.endDate <= input.startDate) {
      throw new BusinessRuleError('endDate must be after startDate.');
    }

    const existing = await this.fiscalYears.list(db);
    const overlaps = existing.some((fy) => input.startDate <= fy.endDate && input.endDate >= fy.startDate);
    if (overlaps) {
      throw new BusinessRuleError('This date range overlaps an existing fiscal year.');
    }

    return db.transaction().execute(async (trx) => {
      const fiscalYear = await this.fiscalYears.create(trx, input);
      const generated = generateMonthlyPeriods(input.startDate, input.endDate);
      for (const period of generated) {
        await this.periods.create(trx, { fiscalYearId: fiscalYear.id, ...period });
      }
      return fiscalYear;
    });
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateFiscalYearInput): Promise<FiscalYear> {
    const updated = await this.fiscalYears.update(db, id, input);
    if (!updated) throw new NotFoundError(`Fiscal year "${id}" not found.`);
    return updated;
  }

  async close(db: Kysely<TenantDatabase>, id: string): Promise<FiscalYear> {
    const fiscalYear = await this.getById(db, id);
    if (fiscalYear.status === 'closed') {
      throw new BusinessRuleError(`Fiscal year "${fiscalYear.name}" is already closed.`);
    }
    const periods = await this.periods.findByFiscalYearId(db, id);
    const stillOpen = periods.filter((p) => p.status !== 'closed');
    if (stillOpen.length > 0) {
      throw new BusinessRuleError(
        `Cannot close fiscal year "${fiscalYear.name}" — ${stillOpen.length} of its accounting period(s) are ` +
          'still open. Close every period first.',
      );
    }
    const updated = await this.fiscalYears.updateStatus(db, id, 'closed');
    return updated!;
  }

  async reopen(db: Kysely<TenantDatabase>, id: string): Promise<FiscalYear> {
    const fiscalYear = await this.getById(db, id);
    if (fiscalYear.status === 'open') {
      throw new BusinessRuleError(`Fiscal year "${fiscalYear.name}" is already open.`);
    }
    const updated = await this.fiscalYears.updateStatus(db, id, 'open');
    return updated!;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const fiscalYear = await this.getById(db, id);
    const periods = await this.periods.findByFiscalYearId(db, id);
    const touched = periods.some((p) => p.status !== 'open');
    if (touched || fiscalYear.status !== 'open') {
      throw new BusinessRuleError(
        `Cannot delete fiscal year "${fiscalYear.name}" — it (or one of its periods) has already been closed ` +
          'at some point.',
      );
    }
    const deleted = await this.fiscalYears.delete(db, id);
    if (!deleted) throw new NotFoundError(`Fiscal year "${id}" not found.`);
  }
}
