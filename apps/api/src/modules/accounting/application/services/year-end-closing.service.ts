import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { CHART_OF_ACCOUNT_REPOSITORY, type ChartOfAccountRepository } from '../ports/chart-of-account.repository';
import { JOURNAL_ENTRY_LINE_REPOSITORY, type JournalEntryLineRepository } from '../ports/journal-entry-line.repository';
import type { FiscalYear } from '../../domain/fiscal-year.entity';
import { YEAR_END_CLOSING_SOURCE, type CreateJournalEntryLineInput } from '../../domain/journal-entry.entity';
import { FiscalYearsService } from './fiscal-years.service';
import { JournalEntriesService } from './journal-entries.service';
import { AccountingSettingsService } from './accounting-settings.service';
import { requiredAccount } from './treasury-account-resolver';

/**
 * إقفال السنة المالية. Closing a fiscal year (all its periods already
 * closed) posts one closing entry on its last day: every revenue and
 * expense account is brought to zero for the year, and the year's profit
 * (or loss) goes to retained earnings (Accounting Settings, default 32).
 * The next year then starts its income statement from zero, and the
 * balance sheet shows the profit inside equity instead of as a memo line.
 *
 * Reopening the year removes that entry, so the year can be corrected and
 * closed again. The income statement and cash flow leave the closing entry
 * out (it is not the year's activity); the ledger and trial balance show it.
 */
@Injectable()
export class YearEndClosingService {
  constructor(
    private readonly fiscalYears: FiscalYearsService,
    private readonly journalEntries: JournalEntriesService,
    private readonly accountingSettings: AccountingSettingsService,
    @Inject(CHART_OF_ACCOUNT_REPOSITORY) private readonly accounts: ChartOfAccountRepository,
    @Inject(JOURNAL_ENTRY_LINE_REPOSITORY) private readonly lines: JournalEntryLineRepository,
  ) {}

  async close(db: Kysely<TenantDatabase>, fiscalYearId: string): Promise<FiscalYear> {
    return withTransaction(db, async (trx) => {
      const fiscalYear = await this.fiscalYears.getById(trx, fiscalYearId);
      // Validates (all periods closed, not already closed) and flips the status.
      const closed = await this.fiscalYears.close(trx, fiscalYearId);
      const closingLines = await this.closingLines(trx, fiscalYear);
      if (closingLines.length > 0) {
        await this.journalEntries.createAuto(trx, {
          entryDate: fiscalYear.endDate,
          description: `قيد إقفال ${fiscalYear.name}`,
          lines: closingLines,
          sourceReferenceType: YEAR_END_CLOSING_SOURCE,
          sourceReferenceId: fiscalYear.id,
          allowClosedPeriod: true,
        });
      }
      return closed;
    });
  }

  async reopen(db: Kysely<TenantDatabase>, fiscalYearId: string): Promise<FiscalYear> {
    return withTransaction(db, async (trx) => {
      const reopened = await this.fiscalYears.reopen(trx, fiscalYearId);
      await this.journalEntries.removeAutoEntry(trx, YEAR_END_CLOSING_SOURCE, fiscalYearId);
      return reopened;
    });
  }

  /** Zeroes each revenue/expense account's balance for the year; the net goes to retained earnings. */
  private async closingLines(trx: Kysely<TenantDatabase>, fiscalYear: FiscalYear): Promise<CreateJournalEntryLineInput[]> {
    const settings = await this.accountingSettings.get(trx);
    const retainedEarnings = requiredAccount(settings.retainedEarningsAccountId, 'حساب الأرباح المرحّلة');
    const resultAccounts = (await this.accounts.list(trx)).filter(
      (a) => !a.isGroup && (a.accountType === 'revenue' || a.accountType === 'expense'),
    );
    const sums = await this.lines.sumPostedByAccounts(
      trx,
      resultAccounts.map((a) => a.id),
      fiscalYear.startDate,
      fiscalYear.endDate,
      { excludeSourceReferenceTypes: [YEAR_END_CLOSING_SOURCE] },
    );

    const lines: CreateJournalEntryLineInput[] = [];
    let net = 0n; // debit − credit across the result accounts = −profit
    for (const account of resultAccounts) {
      const totals = sums[account.id];
      if (!totals) continue;
      const balance = BigInt(totals.totalDebitMinorUnits) - BigInt(totals.totalCreditMinorUnits);
      if (balance === 0n) continue;
      net += balance;
      // The opposite side empties the account.
      lines.push(
        balance > 0n
          ? { accountId: account.id, debitAmountMinorUnits: '0', creditAmountMinorUnits: balance.toString() }
          : { accountId: account.id, debitAmountMinorUnits: (-balance).toString(), creditAmountMinorUnits: '0' },
      );
    }
    if (net !== 0n) {
      // Profit (net < 0: credits exceeded debits) → credit retained earnings; loss → debit.
      lines.push(
        net < 0n
          ? { accountId: retainedEarnings, debitAmountMinorUnits: '0', creditAmountMinorUnits: (-net).toString() }
          : { accountId: retainedEarnings, debitAmountMinorUnits: net.toString(), creditAmountMinorUnits: '0' },
      );
    }
    return lines.length >= 2 ? lines : [];
  }
}
