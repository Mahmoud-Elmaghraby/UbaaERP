import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Kysely } from 'kysely';
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
    // A tenant that never set up a fiscal year gets the calendar year of its
    // first posting (with its 12 monthly periods) instead of every automatic
    // entry failing — Egyptian companies mostly keep a January–December year,
    // and it stays fully editable. Once ANY fiscal year exists, a date outside
    // all of them is a real error the accountant must fix, never guessed.
    if (!period && this.fiscalYears && (await this.fiscalYears.list(db)).length === 0) {
      const year = date.slice(0, 4);
      await this.fiscalYears.create(db, {
        name: `السنة المالية ${year}`,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
        notes: 'أُنشئت تلقائيًا مع أول قيد محاسبي.',
      });
      period = await this.repository.findByDate(db, date);
    }
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
}
