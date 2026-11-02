import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ChartOfAccountRepository } from '../ports/chart-of-account.repository';
import type { JournalEntryLineRepository } from '../ports/journal-entry-line.repository';
import type { FiscalYearsService } from './fiscal-years.service';
import type { JournalEntriesService } from './journal-entries.service';
import type { AccountingSettingsService } from './accounting-settings.service';
import { YearEndClosingService } from './year-end-closing.service';
import { YEAR_END_CLOSING_SOURCE } from '../../domain/journal-entry.entity';

const db = { isTransaction: true } as unknown as Kysely<TenantDatabase>;
const fy = { id: 'fy1', name: 'السنة المالية 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'open' };
const account = (id: string, accountType: string) => ({ id, accountType, isGroup: false });

function setup(sums: Record<string, { totalDebitMinorUnits: string; totalCreditMinorUnits: string }>) {
  const created: Array<{ lines: Array<{ accountId: string; debitAmountMinorUnits: string; creditAmountMinorUnits: string }> }> = [];
  const journalEntries = {
    createAuto: jest.fn(async (_db: unknown, input: (typeof created)[number]) => {
      created.push(input);
      return {};
    }),
    removeAutoEntry: jest.fn(),
  } as unknown as JournalEntriesService;
  const service = new YearEndClosingService(
    { getById: jest.fn().mockResolvedValue(fy), close: jest.fn().mockResolvedValue({ ...fy, status: 'closed' }), reopen: jest.fn() } as unknown as FiscalYearsService,
    journalEntries,
    { get: jest.fn().mockResolvedValue({ retainedEarningsAccountId: 'ret' }) } as unknown as AccountingSettingsService,
    { list: jest.fn().mockResolvedValue([account('sales', 'revenue'), account('rent', 'expense'), account('cash', 'asset')]) } as unknown as ChartOfAccountRepository,
    { sumPostedByAccounts: jest.fn().mockResolvedValue(sums) } as unknown as JournalEntryLineRepository,
  );
  return { service, created, journalEntries };
}

describe('YearEndClosingService', () => {
  it('empties revenue and expenses into retained earnings (profit)', async () => {
    const { service, created } = setup({
      sales: { totalDebitMinorUnits: '0', totalCreditMinorUnits: '100000' },
      rent: { totalDebitMinorUnits: '30000', totalCreditMinorUnits: '0' },
    });
    await service.close(db, 'fy1');
    expect(created[0]).toMatchObject({
      entryDate: '2026-12-31',
      sourceReferenceType: YEAR_END_CLOSING_SOURCE,
      allowClosedPeriod: true,
      lines: [
        { accountId: 'sales', debitAmountMinorUnits: '100000', creditAmountMinorUnits: '0' },
        { accountId: 'rent', debitAmountMinorUnits: '0', creditAmountMinorUnits: '30000' },
        { accountId: 'ret', debitAmountMinorUnits: '0', creditAmountMinorUnits: '70000' },
      ],
    });
  });

  it('a loss debits retained earnings', async () => {
    const { service, created } = setup({
      sales: { totalDebitMinorUnits: '0', totalCreditMinorUnits: '10000' },
      rent: { totalDebitMinorUnits: '25000', totalCreditMinorUnits: '0' },
    });
    await service.close(db, 'fy1');
    expect(created[0].lines.at(-1)).toEqual({ accountId: 'ret', debitAmountMinorUnits: '15000', creditAmountMinorUnits: '0' });
  });

  it('no activity → no entry', async () => {
    const { service, created } = setup({});
    await service.close(db, 'fy1');
    expect(created).toEqual([]);
  });

  it('reopening removes the closing entry', async () => {
    const { service, journalEntries } = setup({});
    await service.reopen(db, 'fy1');
    expect(journalEntries.removeAutoEntry).toHaveBeenCalledWith(db, YEAR_END_CLOSING_SOURCE, 'fy1');
  });
});
