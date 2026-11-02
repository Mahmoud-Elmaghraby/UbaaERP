import { Inject, Injectable, Optional } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { ACCOUNTING_PERIOD_REPOSITORY, type AccountingPeriodRepository } from '../ports/accounting-period.repository';
import type { AccountingPeriod } from '../../domain/accounting-period.entity';
import { BusinessRuleError } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { FiscalYearsService } from './fiscal-years.service';

/**
 * Accounting periods (CLAUDE.md §10 — step 5, Accounting, Stage 1). No
 * standalone create — see FiscalYearsService.create(). Only close()/
 * reopen() actions, plus assertOpenForDate(), the forward-compatible
 * hook the future Journal Entries stage (not yet built) will call before
 * allowing any post.
 */
@Injectable()
export class AccountingPeriodsService {
  constructor(
    @Inject(ACCOUNTING_PERIOD_REPOSITORY) private readonly repository: AccountingPeriodRepository,
    // Optional so unit tests that build the service by hand keep working; Nest always provides it.
    @Optional() private readonly fiscalYears?: FiscalYearsService,
  ) {}

  list(db: Kysely<TenantDatabase>, fiscalYearId?: string): Promise<AccountingPeriod[]> {
    return this.repository.list(db, fiscalYearId);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<AccountingPeriod> {
    const period = await this.repository.findById(db, id);
    if (!period) throw entityNotFound('ACCOUNTING_PERIOD', id);
    return period;
  }

  async close(db: Kysely<TenantDatabase>, id: string): Promise<AccountingPeriod> {
    const period = await this.getById(db, id);
    if (period.status === 'closed') {
      throw new BusinessRuleError(`Period "${period.name}" is already closed.`, {
        code: 'ACCOUNTING_PERIOD.ALREADY_CLOSED',
        params: { name: period.name },
      });
    }
    const updated = await this.repository.updateStatus(db, id, 'closed');
    return updated!;
  }

  async reopen(db: Kysely<TenantDatabase>, id: string): Promise<AccountingPeriod> {
    const period = await this.getById(db, id);
    if (period.status === 'open') {
      throw new BusinessRuleError(`Period "${period.name}" is already open.`, {
        code: 'ACCOUNTING_PERIOD.ALREADY_OPEN',
        params: { name: period.name },
      });
    }
    const fiscalYear = this.fiscalYears ? await this.fiscalYears.getById(db, period.fiscalYearId) : null;
    if (fiscalYear?.status === 'closed') {
      throw new BusinessRuleError(`Period "${period.name}" belongs to the closed fiscal year "${fiscalYear.name}".`, {
        code: 'ACCOUNTING_PERIOD.FISCAL_YEAR_CLOSED',
        params: { name: period.name, fiscalYear: fiscalYear.name },
      });
    }
    const updated = await this.repository.updateStatus(db, id, 'open');
    return updated!;
  }

  /**
   * Forward-compatible plumbing for Stage 2 (Journal Entries, not yet
   * built): finds the accounting period covering `date` and asserts
   * it's open. CLAUDE.md's period-close semantics ("closed blocks new
   * postings") live here, once, rather than being re-derived per caller.
   */
  async assertOpenForDate(db: Kysely<TenantDatabase>, date: string): Promise<AccountingPeriod> {
    let period = await this.repository.findByDate(db, date);
    if (!period && this.fiscalYears) period = await this.autoCreateFiscalYearFor(db, date);
    if (!period) {
      throw new BusinessRuleError(
        `No accounting period covers ${date} — set up a fiscal year covering this date first.`,
        { code: 'ACCOUNTING_PERIOD.NO_PERIOD_FOR_DATE', params: { date } },
      );
    }
    if (period.status !== 'open') {
      throw new BusinessRuleError(
        `Accounting period "${period.name}" is closed — cannot post an entry dated ${date}.`,
        { code: 'ACCOUNTING_PERIOD.CLOSED', params: { name: period.name, date } },
      );
    }
    return period;
  }

  /** Serialises automatic fiscal-year creation across concurrent postings (held until the transaction ends). */
  protected async lockFiscalYearCreation(trx: Kysely<TenantDatabase>): Promise<void> {
    await sql`SELECT pg_advisory_xact_lock(hashtext('accounting.fiscal_year.autocreate'))`.execute(trx);
  }

  /**
   * Fiscal years never block automatic postings:
   *   - a tenant with none gets the calendar year of its first posting;
   *   - a date just after the last year rolls forward, year by year (same
   *     start day and length as the last one), at most MAX_ROLL_FORWARD
   *     years — so 1 January never stops invoices from reaching the ledger.
   * A date BEFORE the first year, or far in the future, is a real error the
   * accountant must fix, never guessed. An advisory lock keeps two postings
   * running at once from both creating the same year.
   */
  private async autoCreateFiscalYearFor(db: Kysely<TenantDatabase>, date: string): Promise<AccountingPeriod | null> {
    const fiscalYears = this.fiscalYears!;
    return withTransaction(db, async (trx) => {
      await this.lockFiscalYearCreation(trx);
      const again = await this.repository.findByDate(trx, date);
      if (again) return again;

      const years = await fiscalYears.list(trx);
      if (years.length === 0) {
        const year = date.slice(0, 4);
        await fiscalYears.create(trx, {
          name: `السنة المالية ${year}`,
          startDate: `${year}-01-01`,
          endDate: `${year}-12-31`,
          notes: 'أُنشئت تلقائيًا مع أول قيد محاسبي.',
        });
        return this.repository.findByDate(trx, date);
      }

      let last = years.reduce((a, b) => (b.endDate > a.endDate ? b : a));
      if (date <= last.endDate) return null; // a gap or a date before the first year
      for (let i = 0; i < MAX_ROLL_FORWARD && date > last.endDate; i += 1) {
        const startDate = addDays(last.endDate, 1);
        const endDate = addDays(addYears(startDate, 1), -1);
        const startYear = startDate.slice(0, 4);
        const endYear = endDate.slice(0, 4);
        last = await fiscalYears.create(trx, {
          name: startYear === endYear ? `السنة المالية ${startYear}` : `السنة المالية ${startYear}/${endYear}`,
          startDate,
          endDate,
          notes: 'أُنشئت تلقائيًا بعد نهاية السنة السابقة.',
        });
      }
      return this.repository.findByDate(trx, date);
    });
  }
}

const MAX_ROLL_FORWARD = 2;

/** 'YYYY-MM-DD' ± days, in UTC (date-only values never carry a time zone). */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addYears(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}
