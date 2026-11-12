import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { OutboxWriterService } from '../../src/shared/outbox/application/services/outbox-writer.service';
import { KyselyOutboxEventRepository } from '../../src/shared/outbox/infrastructure/persistence/kysely-outbox-event.repository';
import { TreasuryMovementRegistry } from '../../src/shared/treasury/treasury-movements';
import { EmployeesService } from '../../src/modules/hr/application/employees.service';
import { LoansService } from '../../src/modules/hr/application/loans.service';
import { HrLoanMovements } from '../../src/modules/hr/infrastructure/hr-loan-movements';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** HR step 5 (migration 0127): loans through a treasury, and bonuses/penalties. */
describe('HR loans (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let employees: EmployeesService;
  let loans: LoansService;
  const registry = new TreasuryMovementRegistry();
  const s = uniqueSuffix();
  const ctx = { schema: 'test', userId: null };
  let currency = 'EGP';
  const approver = '00000000-0000-0000-0000-0000000000b1';

  beforeAll(async () => {
    db = openIntegrationDb();
    const numbering = new NumberingSequencesService(new KyselyNumberingSequenceRepository());
    employees = new EmployeesService(numbering);
    loans = new LoansService(numbering, new OutboxWriterService(new KyselyOutboxEventRepository()), registry);
    new HrLoanMovements(registry).onModuleInit();
    const role = await db.selectFrom('roles').select('id').executeTakeFirstOrThrow();
    await db
      .insertInto('users')
      .values({ id: approver, email: `loans-${s}@x.test`, full_name: `HR ${s}`, password_hash: 'x', role_id: role.id, is_active: true } as never)
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();
    currency = (await db.selectFrom('tenant_settings').select('currency_code').executeTakeFirst())?.currency_code ?? 'EGP';
  });

  afterAll(async () => {
    await db.destroy();
  });

  async function cashBox(openingMinor: string): Promise<string> {
    const id = randomUUID();
    await db
      .insertInto('treasuries')
      .values({
        id,
        code: `HR-${uniqueSuffix()}`,
        name: `Cash ${s}`,
        kind: 'cash',
        bank_name: null,
        account_number: null,
        iban: null,
        currency,
        chart_of_account_id: null,
        opening_balance_amount: openingMinor,
        opening_balance_date: '2026-01-01',
        notes: null,
      })
      .execute();
    return id;
  }

  it('runs a loan from request to closed, moving the treasury and writing outbox events', async () => {
    const box = await cashBox('500000'); // 5,000.00
    const e = await employees.create(db, { fullName: `سلفة ${s}`, hireDate: '2025-01-01', employmentType: 'full_time', paymentMethod: 'cash' });

    const loan = await loans.create(db, { employeeId: e.id, amountMinorUnits: '300000', installmentCount: 3, firstMonth: '2026-02', reason: 'ظرف' }, null);
    expect(loan).toMatchObject({ status: 'pending', installmentCount: 3, remainingMinorUnits: '300000', firstMonth: '2026-02' });
    expect(loan.number).toMatch(/^LN-\d{5}$/);
    expect(loan.installments.map((i) => [i.month, i.amountMinorUnits])).toEqual([
      ['2026-02', '100000'],
      ['2026-03', '100000'],
      ['2026-04', '100000'],
    ]);

    await expect(loans.disburse(db, loan.id, { treasuryId: box, date: '2026-01-20' }, ctx)).rejects.toMatchObject({ code: 'HR_LOAN.WRONG_STATUS' });
    await loans.approve(db, loan.id, { note: 'ok' }, approver);

    // A bigger loan than the cash box holds is refused at pay-out.
    const big = await loans.create(db, { employeeId: e.id, amountMinorUnits: '900000', installmentCount: 9, firstMonth: '2026-02' }, null);
    await loans.approve(db, big.id, {}, approver);
    await expect(loans.disburse(db, big.id, { treasuryId: box, date: '2026-01-20' }, ctx)).rejects.toMatchObject({ code: 'TREASURY.INSUFFICIENT_BALANCE' });
    await loans.cancel(db, big.id, { note: 'مفيش رصيد' }, null);

    const paidOut = await loans.disburse(db, loan.id, { treasuryId: box, date: '2026-01-20' }, ctx);
    expect(paidOut).toMatchObject({ status: 'active', disbursedOn: '2026-01-20', treasuryId: box });

    // skip February: every open installment moves a month
    const postponed = await loans.postpone(db, loan.id, { month: '2026-02' });
    expect(postponed.installments.map((i) => i.month)).toEqual(['2026-03', '2026-04', '2026-05']);

    const partly = await loans.repay(db, loan.id, { treasuryId: box, date: '2026-02-10', amountMinorUnits: '150000' }, ctx);
    expect(partly.installments.map((i) => i.status)).toEqual(['paid', 'partly_paid', 'due']);
    expect(partly.remainingMinorUnits).toBe('150000');
    await expect(loans.repay(db, loan.id, { treasuryId: box, date: '2026-02-11', amountMinorUnits: '150001' }, ctx)).rejects.toMatchObject({
      code: 'HR_LOAN.OVERPAYMENT',
    });
    const closed = await loans.repay(db, loan.id, { treasuryId: box, date: '2026-02-11', amountMinorUnits: '150000' }, ctx);
    expect(closed).toMatchObject({ status: 'closed', remainingMinorUnits: '0' });
    expect(closed.repayments).toHaveLength(2);

    // the cash box: −3,000 out, +1,500 and +1,500 back
    const moves = (await registry.list(db, box)).sort((a, b) => a.date.localeCompare(b.date));
    expect(moves.map((m) => [m.kind, m.amountMinor])).toEqual([
      ['employee_loan', -300000n],
      ['employee_loan_repayment', 150000n],
      ['employee_loan_repayment', 150000n],
    ]);

    const written = await db.selectFrom('outbox_events').select(['event_type', 'payload']).where('event_type', 'like', 'hr.loan.%').execute();
    const mine = written.filter((w) => JSON.stringify(w.payload).includes(loan.number));
    expect(mine.map((w) => w.event_type).sort()).toEqual(['hr.loan.disbursed', 'hr.loan.repaid', 'hr.loan.repaid']);
  });

  it('records bonuses and penalties for many employees at once', async () => {
    const a = await employees.create(db, { fullName: `أ ${s}`, hireDate: '2025-01-01', employmentType: 'full_time', paymentMethod: 'cash' });
    const b = await employees.create(db, { fullName: `ب ${s}`, hireDate: '2025-01-01', employmentType: 'full_time', paymentMethod: 'cash' });
    expect(await loans.createAdjustments(db, { employeeIds: [a.id, b.id], kind: 'bonus', month: '2026-04', amountMinorUnits: '50000', reason: 'العيد' }, null)).toEqual({
      created: 2,
    });
    await loans.createAdjustments(db, { employeeIds: [b.id], kind: 'penalty', month: '2026-04', days: 0.5, reason: 'تأخير متكرر' }, null);
    const april = (await loans.listAdjustments(db, { month: '2026-04' })).filter((x) => [a.id, b.id].includes(x.employeeId));
    expect(april).toHaveLength(3);
    const penalty = april.find((x) => x.kind === 'penalty')!;
    expect(penalty).toMatchObject({ days: 0.5, amountMinorUnits: null, settled: false, month: '2026-04' });
    await loans.deleteAdjustment(db, penalty.id);
    expect((await loans.listAdjustments(db, { month: '2026-04', employeeId: b.id })).map((x) => x.kind)).toEqual(['bonus']);
  });
});
