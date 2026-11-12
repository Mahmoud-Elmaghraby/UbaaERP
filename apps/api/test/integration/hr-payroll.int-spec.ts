import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { AppSettingsRepository } from '../../src/shared/app-settings/app-settings.repository';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { OutboxWriterService } from '../../src/shared/outbox/application/services/outbox-writer.service';
import { KyselyOutboxEventRepository } from '../../src/shared/outbox/infrastructure/persistence/kysely-outbox-event.repository';
import { TreasuryMovementRegistry } from '../../src/shared/treasury/treasury-movements';
import { EmployeesService } from '../../src/modules/hr/application/employees.service';
import { SalaryComponentsService } from '../../src/modules/hr/application/salary-components.service';
import { EmployeeSalariesService } from '../../src/modules/hr/application/employee-salaries.service';
import { AttendanceService } from '../../src/modules/hr/application/attendance.service';
import { LeavesService } from '../../src/modules/hr/application/leaves.service';
import { LoansService } from '../../src/modules/hr/application/loans.service';
import { PayrollService } from '../../src/modules/hr/application/payroll.service';
import { HrPayrollMovements } from '../../src/modules/hr/infrastructure/hr-payroll-movements';
import { payslipLines } from '../../src/modules/hr/infrastructure/hr-print.registration';
import { HrReportsService } from '../../src/modules/hr/application/hr-reports.service';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** HR step 6 (migration 0128): the monthly payroll run, end to end. */
describe('HR payroll (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const s = uniqueSuffix();
  const settings = new AppSettingsRepository();
  const registry = new TreasuryMovementRegistry();
  const outbox = new OutboxWriterService(new KyselyOutboxEventRepository());
  let numbering: NumberingSequencesService;
  let employees: EmployeesService;
  let loans: LoansService;
  let leaves: LeavesService;
  let payroll: PayrollService;
  const components = new SalaryComponentsService();
  const salaries = new EmployeeSalariesService();
  const attendance = new AttendanceService(settings);
  const approver = '00000000-0000-0000-0000-0000000000c1';
  const ctx = { schema: 'test', userId: approver };
  let currency = 'EGP';

  beforeAll(async () => {
    db = openIntegrationDb();
    numbering = new NumberingSequencesService(new KyselyNumberingSequenceRepository());
    employees = new EmployeesService(numbering);
    loans = new LoansService(numbering, outbox, registry);
    leaves = new LeavesService(numbering, attendance);
    payroll = new PayrollService(numbering, settings, outbox, registry);
    new HrPayrollMovements(registry).onModuleInit();
    const role = await db.selectFrom('roles').select('id').executeTakeFirstOrThrow();
    await db
      .insertInto('users')
      .values({ id: approver, email: `pay-${s}@x.test`, full_name: `HR ${s}`, password_hash: 'x', role_id: role.id, is_active: true } as never)
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();
    currency = (await db.selectFrom('tenant_settings').select('currency_code').executeTakeFirst())?.currency_code ?? 'EGP';
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('computes, posts and pays a month', async () => {
    // a department of its own so the run only picks up this test's employee
    const dep = await db
      .insertInto('hr_departments')
      .values({ id: randomUUID(), name: `Payroll ${s}` })
      .returning('id')
      .executeTakeFirstOrThrow();
    const e = await employees.create(db, {
      fullName: `محاسب ${s}`,
      departmentId: dep.id,
      hireDate: '2025-01-01',
      employmentType: 'full_time',
      paymentMethod: 'bank',
      bankName: 'NBE',
      bankAccount: '123',
    });
    const housing = await components.save(db, null, { name: `سكن ${s}`, kind: 'earning', calculation: 'percent_of_basic', defaultPercent: 10 });
    // basic 9,000 + housing 900 → day rate (÷30) = 330
    await salaries.create(db, e.id, { effectiveFrom: '2025-01-01', basicMinorUnits: '900000', lines: [{ componentId: housing.id }] }, null);

    // March 2026: 1 absent day, 90 minutes late (30 over the 60 allowance), 2 h overtime
    const rows: { status: string; late: number; overtime: number }[] = [
      { status: 'absent', late: 0, overtime: 0 },
      { status: 'present', late: 90, overtime: 0 },
      { status: 'present', late: 0, overtime: 120 },
    ];
    for (const [i, r] of rows.entries()) {
      await db
        .insertInto('hr_attendance_days')
        .values({
          id: randomUUID(),
          employee_id: e.id,
          work_date: `2026-03-0${i + 1}`,
          status: r.status,
          check_in_minute: null,
          check_out_minute: null,
          late_minutes: r.late,
          overtime_minutes: r.overtime,
          note: null,
        })
        .execute();
    }
    // one unpaid leave day (Mon 2026-03-09), a 500 bonus, a half-day penalty
    const unpaid = (await leaves.listTypes(db)).find((t) => t.payPercent === 0)!;
    const lv = await leaves.createRequest(db, { employeeId: e.id, leaveTypeId: unpaid.id, startDate: '2026-03-09', endDate: '2026-03-09', halfDay: false }, null);
    await leaves.approve(db, lv.id, {}, approver);
    await loans.createAdjustments(db, { employeeIds: [e.id], kind: 'bonus', month: '2026-03', amountMinorUnits: '50000', reason: 'هدف' }, null);
    await loans.createAdjustments(db, { employeeIds: [e.id], kind: 'penalty', month: '2026-03', days: 0.5, reason: 'تأخير' }, null);

    // a loan paid out in February, 1,000 a month from March
    const box = randomUUID();
    await db
      .insertInto('treasuries')
      .values({ id: box, code: `PY-${s}`, name: `Box ${s}`, kind: 'cash', bank_name: null, account_number: null, iban: null, currency, chart_of_account_id: null, opening_balance_amount: '5000000', opening_balance_date: '2026-01-01', notes: null })
      .execute();
    const loan = await loans.create(db, { employeeId: e.id, amountMinorUnits: '200000', installmentCount: 2, firstMonth: '2026-03' }, null);
    await loans.approve(db, loan.id, {}, approver);
    await loans.disburse(db, loan.id, { treasuryId: box, date: '2026-02-15' }, ctx);

    const run = await payroll.create(db, { month: '2026-03', departmentId: dep.id }, null);
    expect(run).toMatchObject({ status: 'draft', employeeCount: 1, month: '2026-03' });
    expect(run.number).toMatch(/^PR-\d{5}$/);
    const line = run.lines[0]!;
    // day 330, hour 41.25, minute 0.6875
    expect(line).toMatchObject({
      basicMinorUnits: '900000',
      allowancesMinorUnits: '90000',
      overtimeMinorUnits: '12375', // 2 h × 41.25 × 1.5
      bonusesMinorUnits: '50000',
      grossMinorUnits: '1052375',
      absenceMinorUnits: '33000',
      lateMinorUnits: '2063', // 30 min × 0.6875 → 20.625
      unpaidLeaveMinorUnits: '33000',
      penaltiesMinorUnits: '16500',
      loanMinorUnits: '100000',
    });
    expect(line.netMinorUnits).toBe(String(1052375 - 33000 - 2063 - 33000 - 16500 - 100000));
    expect(line.details).toMatchObject({ absentDays: 1, chargeableLateMinutes: 30, overtimeMinutes: 120 });

    // HR forgives the absence; the override survives a recalculation
    const edited = await payroll.updateLine(db, run.id, line.id, { absenceMinorUnits: '0', manualAdjustmentMinorUnits: '-1000', manualAdjustmentNote: 'كسر' });
    expect(edited.lines[0]).toMatchObject({ absenceMinorUnits: '0', overridden: ['absence'] });
    const recalculated = await payroll.recalculate(db, run.id);
    const final = recalculated.lines[0]!;
    expect(final.absenceMinorUnits).toBe('0');
    expect(final.netMinorUnits).toBe(String(1052375 - 2063 - 33000 - 16500 - 100000 - 1000));

    // the employee can't be in a second run of the month
    await expect(payroll.create(db, { month: '2026-03', departmentId: dep.id }, null)).rejects.toMatchObject({ code: 'HR_PAYROLL.NO_EMPLOYEES' });

    const posted = await payroll.post(db, run.id, ctx);
    expect(posted.status).toBe('posted');
    const loanAfter = await loans.get(db, loan.id);
    expect(loanAfter.installments.map((i) => i.status)).toEqual(['paid', 'due']);
    expect((await loans.listAdjustments(db, { month: '2026-03', employeeId: e.id })).every((a) => a.settled)).toBe(true);
    await expect(
      salaries.create(db, e.id, { effectiveFrom: '2026-03-15', basicMinorUnits: '1', lines: [] }, null),
    ).rejects.toMatchObject({ code: 'HR_SALARY.LOCKED_BY_PAYROLL' });
    await expect(payroll.recalculate(db, run.id)).rejects.toMatchObject({ code: 'HR_PAYROLL.WRONG_STATUS' });

    const paid = await payroll.pay(db, run.id, { treasuryId: box, date: '2026-04-01' }, ctx);
    expect(paid.status).toBe('paid');
    expect(paid.lines[0]!.paid).toBe(true);
    const moves = (await registry.list(db, box)).filter((m) => m.kind === 'payroll');
    expect(moves.map((m) => m.amountMinor)).toEqual([-BigInt(final.netMinorUnits)]);

    const events = (await db.selectFrom('outbox_events').select(['event_type', 'payload']).where('event_type', 'like', 'hr.payroll.%').execute()).filter((x) =>
      JSON.stringify(x.payload).includes(run.number),
    );
    expect(events.map((x) => x.event_type).sort()).toEqual(['hr.payroll.paid', 'hr.payroll.posted']);
    const postedMeta = (events.find((x) => x.event_type === 'hr.payroll.posted')!.payload as { metadata: Record<string, string> }).metadata;
    expect(BigInt(postedMeta.expenseMinorUnits)).toBe(BigInt(postedMeta.netMinorUnits) + BigInt(postedMeta.loanMinorUnits));
    expect(postedMeta.date).toBe('2026-03-31');

    // the payslip adds up to the net
    const slip = payslipLines(paid.lines[0]!, currency);
    expect(slip.reduce((sum, l) => sum + BigInt(l.amount!.amountMinorUnits), 0n).toString()).toBe(final.netMinorUnits);

    // the HR overview shows the posted month only to those who may see pay
    const reports = new HrReportsService();
    const withPay = await reports.overview(db, 2026, ['hr.employees.view', 'hr.payroll.view']);
    const march = withPay.payrollCost!.find((m) => m.month === '2026-03')!;
    expect(BigInt(march.expenseMinorUnits)).toBeGreaterThanOrEqual(BigInt(final.netMinorUnits) + 100000n);
    expect(withPay.costByDepartment!.some((d) => d.departmentName === `Payroll ${s}`)).toBe(true);
    const withoutPay = await reports.overview(db, 2026, ['hr.employees.view']);
    expect(withoutPay.payrollCost).toBeNull();
    expect(withoutPay.openLoans).toBeNull();
  });
});
