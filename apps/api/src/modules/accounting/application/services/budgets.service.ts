import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { BudgetDto, BudgetVsActualDto, SaveBudgetDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { localIsoDate } from '../../../../shared/time/local-date';
import { CHART_OF_ACCOUNT_REPOSITORY, type ChartOfAccountRepository } from '../ports/chart-of-account.repository';
import { JOURNAL_ENTRY_LINE_REPOSITORY, type JournalEntryLineRepository } from '../ports/journal-entry-line.repository';
import { YEAR_END_CLOSING_SOURCE } from '../../domain/journal-entry.entity';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import { addMonthsClamped, monthEnd } from './date-math';

/**
 * الموازنات التقديرية — planned amounts per account and month of a fiscal
 * year, compared with what was actually posted. Amounts are kept on the
 * account's natural side (revenue as a positive income, an expense as a
 * positive cost), so "variance" reads the same for every account:
 * actual − budget.
 */
@Injectable()
export class BudgetsService {
  constructor(
    @Inject(CHART_OF_ACCOUNT_REPOSITORY) private readonly accounts: ChartOfAccountRepository,
    @Inject(JOURNAL_ENTRY_LINE_REPOSITORY) private readonly journalLines: JournalEntryLineRepository,
    private readonly tenantSettings: TenantSettingsService,
  ) {}

  async list(db: Kysely<TenantDatabase>): Promise<Omit<BudgetDto, 'lines'>[]> {
    const rows = await db.selectFrom('budgets').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map((r) => ({ id: r.id, name: r.name, fiscalYearId: r.fiscal_year_id, notes: r.notes }));
  }

  async get(db: Kysely<TenantDatabase>, id: string): Promise<BudgetDto> {
    const budget = await db.selectFrom('budgets').selectAll().where('id', '=', id).executeTakeFirst();
    if (!budget) throw entityNotFound('BUDGET', id);
    const rows = await db.selectFrom('budget_lines').selectAll().where('budget_id', '=', id).execute();
    const byAccount = new Map<string, string[]>();
    for (const row of rows) {
      const months = byAccount.get(row.account_id) ?? Array.from({ length: 12 }, () => '0');
      months[row.month - 1] = String(row.amount);
      byAccount.set(row.account_id, months);
    }
    return {
      id: budget.id,
      name: budget.name,
      fiscalYearId: budget.fiscal_year_id,
      notes: budget.notes,
      lines: [...byAccount.entries()].map(([accountId, months]) => ({ accountId, months })),
    };
  }

  async save(db: Kysely<TenantDatabase>, id: string | null, input: SaveBudgetDto): Promise<BudgetDto> {
    const budgetId = id ?? randomUUID();
    await withTransaction(db, async (trx) => {
      if (id) {
        const updated = await trx
          .updateTable('budgets')
          .set({ name: input.name, fiscal_year_id: input.fiscalYearId, notes: input.notes ?? null, updated_at: new Date() })
          .where('id', '=', id)
          .executeTakeFirst();
        if (!updated.numUpdatedRows) throw entityNotFound('BUDGET', id);
        await trx.deleteFrom('budget_lines').where('budget_id', '=', id).execute();
      } else {
        await trx.insertInto('budgets').values({ id: budgetId, name: input.name, fiscal_year_id: input.fiscalYearId, notes: input.notes ?? null }).execute();
      }
      const values = input.lines.flatMap((line) =>
        line.months
          .map((amount, index) => ({ id: randomUUID(), budget_id: budgetId, account_id: line.accountId, month: index + 1, amount }))
          .filter((row) => row.amount !== '0'),
      );
      for (let start = 0; start < values.length; start += 1000) {
        await trx.insertInto('budget_lines').values(values.slice(start, start + 1000)).execute();
      }
    });
    return this.get(db, budgetId);
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const result = await db.deleteFrom('budgets').where('id', '=', id).executeTakeFirst();
    if (!result.numDeletedRows) throw entityNotFound('BUDGET', id);
  }

  /** Budget vs actual from the fiscal year's start through `toDate` (default today, capped at the year's end). */
  async vsActual(db: Kysely<TenantDatabase>, id: string, toDate?: string): Promise<BudgetVsActualDto> {
    const budget = await this.get(db, id);
    const year = await db.selectFrom('fiscal_years').select(['start_date', 'end_date']).where('id', '=', budget.fiscalYearId).executeTakeFirstOrThrow();
    const start = toIso(year.start_date);
    const end = toIso(year.end_date);
    const until = [toDate ?? localIsoDate(), end].sort()[0]!;
    // Months of the year that have begun by `until` count in full.
    const monthsIn = Array.from({ length: 12 }, (_, i) => addMonthsClamped(start, i)).filter((m) => m <= until).length;

    const accounts = await this.accounts.list(db);
    const ids = new Set(budget.lines.map((l) => l.accountId));
    const relevant = accounts.filter((a) => ids.has(a.id));
    const sums = await this.journalLines.sumPostedByAccounts(db, [...ids], start, monthEnd(until) < end ? monthEnd(until) : end, {
      excludeSourceReferenceTypes: [YEAR_END_CLOSING_SOURCE],
    });
    const currency = (await this.tenantSettings.get(db)).currencyCode;

    const rows = relevant
      .map((account) => {
        const months = budget.lines.find((l) => l.accountId === account.id)!.months;
        const planned = months.slice(0, monthsIn).reduce((sum, m) => sum + BigInt(m), 0n);
        const totals = sums[account.id];
        const net = totals ? BigInt(totals.totalDebitMinorUnits) - BigInt(totals.totalCreditMinorUnits) : 0n;
        const actual = account.normalBalance === 'credit' ? -net : net;
        return {
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          accountType: account.accountType,
          budgetMinorUnits: planned.toString(),
          actualMinorUnits: actual.toString(),
          varianceMinorUnits: (actual - planned).toString(),
        };
      })
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    return { budgetId: id, fromDate: start, toDate: until, currency, rows };
  }
}

function toIso(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : localIsoDate(value);
}
