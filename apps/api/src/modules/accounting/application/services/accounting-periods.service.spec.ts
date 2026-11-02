import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { AccountingPeriodRepository } from '../ports/accounting-period.repository';
import type { AccountingPeriod } from '../../domain/accounting-period.entity';
import type { FiscalYear, CreateFiscalYearInput } from '../../domain/fiscal-year.entity';
import { AccountingPeriodsService } from './accounting-periods.service';
import type { FiscalYearsService } from './fiscal-years.service';

/**
 * Fiscal years must never stop automatic postings at a year boundary:
 * a date just after the last year rolls forward; a date in a gap, before
 * the first year or too far ahead is still an error.
 */
describe('AccountingPeriodsService.assertOpenForDate — fiscal year roll-forward', () => {
  // A transaction stand-in: withTransaction() runs the callback directly on it.
  const db = { isTransaction: true } as unknown as Kysely<TenantDatabase>;

  function setup(initialYears: Array<Pick<FiscalYear, 'startDate' | 'endDate'>>) {
    const years: FiscalYear[] = initialYears.map((y, i) => fiscalYear(`fy${i}`, y.startDate, y.endDate));
    const created: CreateFiscalYearInput[] = [];
    const repository = {
      findByDate: jest.fn(async (_db: unknown, date: string) => {
        const year = years.find((y) => y.startDate <= date && date <= y.endDate);
        return year ? period(year.id, date) : null;
      }),
    } as unknown as AccountingPeriodRepository;
    const fiscalYears = {
      list: jest.fn(async () => years),
      create: jest.fn(async (_db: unknown, input: CreateFiscalYearInput) => {
        created.push(input);
        const year = fiscalYear(`new${created.length}`, input.startDate, input.endDate);
        years.push(year);
        return year;
      }),
    } as unknown as FiscalYearsService;
    const service = new AccountingPeriodsService(repository, fiscalYears);
    jest.spyOn(service as unknown as { lockFiscalYearCreation: () => Promise<void> }, 'lockFiscalYearCreation').mockResolvedValue();
    return { service, created };
  }

  it('creates the next calendar year when a posting lands on 1 January', async () => {
    const { service, created } = setup([{ startDate: '2026-01-01', endDate: '2026-12-31' }]);
    await service.assertOpenForDate(db, '2027-01-01');
    expect(created).toEqual([expect.objectContaining({ name: 'السنة المالية 2027', startDate: '2027-01-01', endDate: '2027-12-31' })]);
  });

  it('keeps a non-calendar year shape (July–June)', async () => {
    const { service, created } = setup([{ startDate: '2025-07-01', endDate: '2026-06-30' }]);
    await service.assertOpenForDate(db, '2026-08-15');
    expect(created).toEqual([
      expect.objectContaining({ name: 'السنة المالية 2026/2027', startDate: '2026-07-01', endDate: '2027-06-30' }),
    ]);
  });

  it('rolls forward up to two years, then refuses', async () => {
    const ok = setup([{ startDate: '2026-01-01', endDate: '2026-12-31' }]);
    await ok.service.assertOpenForDate(db, '2028-03-01');
    expect(ok.created.map((c) => c.startDate)).toEqual(['2027-01-01', '2028-01-01']);

    const far = setup([{ startDate: '2026-01-01', endDate: '2026-12-31' }]);
    await expect(far.service.assertOpenForDate(db, '2029-03-01')).rejects.toMatchObject({
      code: 'ACCOUNTING_PERIOD.NO_PERIOD_FOR_DATE',
    });
  });

  it('never guesses a date before the first year', async () => {
    const { service, created } = setup([{ startDate: '2026-01-01', endDate: '2026-12-31' }]);
    await expect(service.assertOpenForDate(db, '2025-12-31')).rejects.toMatchObject({
      code: 'ACCOUNTING_PERIOD.NO_PERIOD_FOR_DATE',
    });
    expect(created).toEqual([]);
  });

  it('creates the calendar year of the first posting when there is none', async () => {
    const { service, created } = setup([]);
    await service.assertOpenForDate(db, '2026-05-10');
    expect(created).toEqual([expect.objectContaining({ startDate: '2026-01-01', endDate: '2026-12-31' })]);
  });
});

function fiscalYear(id: string, startDate: string, endDate: string): FiscalYear {
  return {
    id,
    name: id,
    startDate,
    endDate,
    status: 'open',
    notes: null,
    customFields: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function period(fiscalYearId: string, date: string): AccountingPeriod {
  return {
    id: `${fiscalYearId}-${date.slice(0, 7)}`,
    fiscalYearId,
    name: date.slice(0, 7),
    startDate: `${date.slice(0, 7)}-01`,
    endDate: `${date.slice(0, 7)}-28`,
    status: 'open',
  } as AccountingPeriod;
}
