import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { AppSettingsRepository } from '../../src/shared/app-settings/app-settings.repository';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { EmployeesService } from '../../src/modules/hr/application/employees.service';
import { AttendanceService } from '../../src/modules/hr/application/attendance.service';
import { LeavesService } from '../../src/modules/hr/application/leaves.service';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** HR step 4 (migration 0126): leave types, balances, requests and the attendance link. */
describe('HR leaves (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let employees: EmployeesService;
  let leaves: LeavesService;
  const attendance = new AttendanceService(new AppSettingsRepository());
  const s = uniqueSuffix();
  const approver = '00000000-0000-0000-0000-0000000000a1';

  beforeAll(async () => {
    db = openIntegrationDb();
    const numbering = new NumberingSequencesService(new KyselyNumberingSequenceRepository());
    employees = new EmployeesService(numbering);
    leaves = new LeavesService(numbering, attendance);
    const role = await db.selectFrom('roles').select('id').executeTakeFirstOrThrow();
    await db
      .insertInto('users')
      .values({ id: approver, email: `hr-${s}@x.test`, full_name: `HR ${s}`, password_hash: 'x', role_id: role.id, is_active: true } as never)
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();
  });

  afterAll(async () => {
    const mine = db.selectFrom('employees').select('id').where('full_name', 'like', `%${s}`);
    await db.deleteFrom('hr_attendance_days').where('employee_id', 'in', mine).execute();
    await db.deleteFrom('hr_leave_requests').where('employee_id', 'in', mine).execute();
    await db.deleteFrom('employees').where('full_name', 'like', `%${s}`).execute();
    await db.deleteFrom('hr_leave_types').where('name', 'like', `%${s}`).execute();
    await db.destroy();
  });

  it('seeds the Egyptian defaults, with casual leave inside the annual balance', async () => {
    const types = await leaves.listTypes(db);
    const annual = types.find((t) => t.name === 'اعتيادي')!;
    expect(annual).toMatchObject({ annualDays: 21, hasBalance: true, payPercent: 100 });
    expect(types.find((t) => t.name === 'عارضة')).toMatchObject({ annualDays: 6, parentTypeId: annual.id });
    expect(types.find((t) => t.name === 'بدون أجر')).toMatchObject({ payPercent: 0, hasBalance: false });
  });

  it('counts working days, guards the balance, and marks approved days on the sheet', async () => {
    const types = await leaves.listTypes(db);
    const annual = types.find((t) => t.name === 'اعتيادي')!;
    const casual = types.find((t) => t.name === 'عارضة')!;
    const e = await employees.create(db, { fullName: `أحمد ${s}`, hireDate: '2025-01-01', employmentType: 'full_time', paymentMethod: 'cash' });

    // Sun 2026-03-01 … Sat 03-07 with the default shift (Friday off) → 6 working days.
    const preview = await leaves.preview(db, { employeeId: e.id, leaveTypeId: annual.id, startDate: '2026-03-01', endDate: '2026-03-07', halfDay: false });
    expect(preview).toEqual({ days: 6, available: 21, pending: 0 });

    const week = await leaves.createRequest(
      db,
      { employeeId: e.id, leaveTypeId: annual.id, startDate: '2026-03-01', endDate: '2026-03-07', halfDay: false, reason: 'سفر' },
      approver,
    );
    expect(week).toMatchObject({ status: 'pending', days: 6 });
    expect(week.number).toMatch(/^LV-\d{5}$/);

    await expect(
      leaves.createRequest(db, { employeeId: e.id, leaveTypeId: casual.id, startDate: '2026-03-05', endDate: '2026-03-05', halfDay: false }, approver),
    ).rejects.toMatchObject({ code: 'HR_LEAVE.OVERLAP' });
    await expect(
      leaves.createRequest(db, { employeeId: e.id, leaveTypeId: annual.id, startDate: '2026-12-30', endDate: '2027-01-02', halfDay: false }, approver),
    ).rejects.toMatchObject({ code: 'HR_LEAVE.CROSS_YEAR' });

    // casual: 6 days of its own, but also out of what's left of annual (21 − 6 pending = 15)
    await leaves.createRequest(db, { employeeId: e.id, leaveTypeId: casual.id, startDate: '2026-04-05', endDate: '2026-04-09', halfDay: false }, approver);
    await expect(
      leaves.createRequest(db, { employeeId: e.id, leaveTypeId: casual.id, startDate: '2026-04-12', endDate: '2026-04-13', halfDay: false }, approver),
    ).rejects.toMatchObject({ code: 'HR_LEAVE.INSUFFICIENT_BALANCE' });
    const half = await leaves.createRequest(
      db,
      { employeeId: e.id, leaveTypeId: casual.id, startDate: '2026-04-12', endDate: '2026-04-12', halfDay: true },
      approver,
    );
    expect(half.days).toBe(0.5);

    await leaves.approve(db, week.id, { note: 'تمام' }, approver);
    const balances = await leaves.balances(db, { year: 2026, employeeId: e.id });
    expect(balances.find((b) => b.leaveTypeId === annual.id)).toMatchObject({ entitled: 21, used: 6, pending: 5.5, available: 9.5 });
    expect(balances.find((b) => b.leaveTypeId === casual.id)).toMatchObject({ entitled: 6, used: 0, pending: 5.5, available: 0.5 });

    // the approved week shows as leave on the sheet; Friday stays a weekend
    const sheet = await attendance.list(db, { from: '2026-03-01', to: '2026-03-07', employeeId: e.id });
    const byDate = new Map(sheet.map((d) => [d.workDate, d.status]));
    expect(byDate.get('2026-03-02')).toBe('leave');
    expect(byDate.get('2026-03-06')).toBe('weekend');
    expect((await attendance.summary(db, { from: '2026-03-01', to: '2026-03-07', employeeId: e.id }))[0]).toMatchObject({ leaveDays: 6, absentDays: 0 });

    // cancelling gives the days back and the sheet shows absences again
    await leaves.cancel(db, week.id, {}, approver);
    expect((await leaves.balances(db, { year: 2026, employeeId: e.id, leaveTypeId: annual.id }))[0]).toMatchObject({ used: 0 });
    const after = await attendance.list(db, { from: '2026-03-02', to: '2026-03-02', employeeId: e.id });
    expect(after[0]?.status).toBe('absent');
    await expect(leaves.approve(db, week.id, {}, approver)).rejects.toMatchObject({ code: 'HR_LEAVE.NOT_PENDING' });
  });

  it('refuses self-approval and carries unused days over up to the cap', async () => {
    const type = await leaves.saveType(db, null, { name: `سنوي ${s}`, payPercent: 100, hasBalance: true, annualDays: 10, maxCarryOver: 3 });
    const e = await employees.create(db, { fullName: `منى ${s}`, hireDate: '2024-01-01', employmentType: 'full_time', paymentMethod: 'cash', userId: approver });
    const r = await leaves.createRequest(db, { employeeId: e.id, leaveTypeId: type.id, startDate: '2025-06-01', endDate: '2025-06-01', halfDay: false }, approver);
    await expect(leaves.approve(db, r.id, {}, approver)).rejects.toMatchObject({ code: 'HR_LEAVE.SELF_APPROVAL' });

    await leaves.saveBalance(db, { employeeId: e.id, leaveTypeId: type.id, year: 2025, entitled: 10, carriedOver: 0, adjustment: -2, note: 'رصيد افتتاحي' });
    // 10 − 2 = 8 unused (the pending day is still unused) → capped at 3
    await leaves.carryOverYear(db, { fromYear: 2025 });
    expect((await leaves.balances(db, { year: 2026, employeeId: e.id, leaveTypeId: type.id }))[0]).toMatchObject({
      entitled: 10,
      carriedOver: 3,
      available: 13,
    });
  });
});
