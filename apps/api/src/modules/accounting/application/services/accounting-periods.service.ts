import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { ACCOUNTING_PERIOD_REPOSITORY, type AccountingPeriodRepository } from '../ports/accounting-period.repository';
import type { AccountingPeriod } from '../../domain/accounting-period.entity';
import { BusinessRuleError, NotFoundError } from '../errors';

/**
 * Accounting periods (CLAUDE.md §10 — step 5, Accounting, Stage 1). No
 * standalone create — see FiscalYearsService.create(). Only close()/
 * reopen() actions, plus assertOpenForDate(), the forward-compatible
 * hook the future Journal Entries stage (not yet built) will call before
 * allowing any post.
 */
@Injectable()
export class AccountingPeriodsService {
  constructor(@Inject(ACCOUNTING_PERIOD_REPOSITORY) private readonly repository: AccountingPeriodRepository) {}

  list(db: Kysely<TenantDatabase>, fiscalYearId?: string): Promise<AccountingPeriod[]> {
    return this.repository.list(db, fiscalYearId);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<AccountingPeriod> {
    const period = await this.repository.findById(db, id);
    if (!period) throw new NotFoundError(`Accounting period "${id}" not found.`);
    return period;
  }

  async close(db: Kysely<TenantDatabase>, id: string): Promise<AccountingPeriod> {
    const period = await this.getById(db, id);
    if (period.status === 'closed') throw new BusinessRuleError(`Period "${period.name}" is already closed.`);
    const updated = await this.repository.updateStatus(db, id, 'closed');
    return updated!;
  }

  async reopen(db: Kysely<TenantDatabase>, id: string): Promise<AccountingPeriod> {
    const period = await this.getById(db, id);
    if (period.status === 'open') throw new BusinessRuleError(`Period "${period.name}" is already open.`);
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
    const period = await this.repository.findByDate(db, date);
    if (!period) {
      throw new BusinessRuleError(
        `No accounting period covers ${date} — set up a fiscal year covering this date first.`,
      );
    }
    if (period.status !== 'open') {
      throw new BusinessRuleError(`Accounting period "${period.name}" is closed — cannot post an entry dated ${date}.`);
    }
    return period;
  }
}
