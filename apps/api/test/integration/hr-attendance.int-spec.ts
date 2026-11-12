import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { AppSettingsRepository } from '../../src/shared/app-settings/app-settings.repository';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { EmployeesService } from '../../src/modules/hr/application/employees.service';
import { AttendanceSetupService } from '../../src/modules/hr/application/attendance-setup.service';
import { AttendanceService } from '../../src/modules/hr/application/attendance.service';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** HR step 3 (migration 0125): shifts, holidays, punch import and the daily sheet. */
describe('HR attendance (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let employees: EmployeesService;
  const setup = new AttendanceSetupService();
  const attendance = new AttendanceService(new AppSettingsRepository());
  const s = uniqueSuffix();
  // A past week: Sun 2026-03-01 … Sat 2026-03-07 (Friday 03-06 is the default day off).
  const from = '2026-03-01';
  const to = '2026-03-07';

  beforeAll(() => {
    db = openIntegrationDb();
    employees = new EmployeesService(new NumberingSequencesService(new KyselyNumberingSequenceRepository()));
  });

  afterAll(async () => {
    await db.deleteFrom('employees').where('full_name', 'like', `%${s}`).execute();
    await db.deleteFrom('hr_shifts').where('name', 'like', `%${s}`).execute();
    await db.deleteFrom('hr_public_holidays').where('name', 'like', `%${s}`).execute();
    await db.destroy();
  });

  it('seeds one default shift and keeps exactly one', async () => {
    const shifts = await setup.listShifts(db);
    const base = shifts.find((x) => x.isDefault)!;
    expect(base).toMatchObject({ startMinute: 540, endMinute: 1020, weeklyOffDays: [5], scheduledMinutes: 480 });
    await expect(setup.saveShift(db, base.id, { ...base, isDefault: false })).rejects.toMatchObject({ code: 'HR_SHIFT.DEFAULT_REQUIRED' });
    await expect(setup.deleteShift(db, base.id)).rejects.toMatchObject({ code: 'HR_SHIFT.DEFAULT_REQUIRED' });
  });

  it('imports a device export, builds the week, keeps hand corrections', async () => {
    const night = await setup.saveShift(db, null, {
      name: `ليلي ${s}`,
      startMinute: 1320,
      endMinute: 360,
      graceMinutes: 10,
      breakMinutes: 0,
      weeklyOffDays: [],
    });
    const day = await employees.create(db, {
      fullName: `نهاري ${s}`,
      attendanceCode: `9${s.length}01`,
      hireDate: '2026-01-01',
      employmentType: 'full_time',
      paymentMethod: 'cash',
    });
    const nightWorker = await employees.create(db, {
      code: `N-${s}`,
      fullName: `ليلي ${s}`,
      shiftId: night.id,
      hireDate: '2026-01-01',
      employmentType: 'full_time',
      paymentMethod: 'cash',
    });
    await setup.addHolidays(db, { dates: ['2026-03-03'], name: `عيد ${s}` });

    const deviceId = `000${day.attendanceCode}`; // devices pad numbers
    const result = await attendance.import(
      db,
      {
        fileName: 'device.xlsx',
        dateFormat: 'dmy',
        rows: [
          // Sun: on time, leaves on time
          { employeeKey: deviceId, date: '01/03/2026', time: '08:58' },
          { employeeKey: deviceId, date: '01/03/2026', time: '17:02' },
          // Mon: 40 min late, stays 90 min longer
          { employeeKey: deviceId, date: '02/03/2026', time: '09:40 ص' },
          { employeeKey: deviceId, date: '02/03/2026', time: '06:30 م' },
          // Tue is a holiday, Wed and Sat absent, Thu only a check-in
          { employeeKey: deviceId, date: '05/03/2026', time: '09:00' },
          // night worker: Sun 22:00 → Mon 06:05
          { employeeKey: `N-${s}`, date: '2026-03-01 22:00', time: '' },
          { employeeKey: `N-${s}`, date: '2026-03-02 06:05', time: '' },
          // the same punch twice, an unknown key, and a broken date
          { employeeKey: deviceId, date: '01/03/2026', time: '08:58' },
          { employeeKey: 'X-404', date: '01/03/2026', time: '08:00' },
          { employeeKey: deviceId, date: '32/03/2026', time: '08:00' },
        ],
      },
      null,
    );
    expect(result).toMatchObject({ rowsTotal: 10, imported: 7, unmatchedKeys: ['X-404'], invalidRows: [10], from: '2026-03-01', to: '2026-03-05' });

    // Re-importing the same punches adds nothing.
    const again = await attendance.import(db, { fileName: 'again', dateFormat: 'dmy', rows: [{ employeeKey: deviceId, date: '01/03/2026', time: '08:58' }] }, null);
    expect(again).toMatchObject({ imported: 0, duplicates: 1 });

    await attendance.rebuild(db, { from, to, employeeIds: [day.id, nightWorker.id] });
    const week = await attendance.list(db, { from, to, employeeId: day.id });
    const byDate = new Map(week.map((d) => [d.workDate, d]));
    expect(byDate.get('2026-03-01')).toMatchObject({ status: 'present', lateMinutes: 0, overtimeMinutes: 0, workedMinutes: 484 });
    expect(byDate.get('2026-03-02')).toMatchObject({ status: 'present', lateMinutes: 40, overtimeMinutes: 50 });
    expect(byDate.get('2026-03-03')?.status).toBe('holiday');
    expect(byDate.get('2026-03-04')?.status).toBe('absent');
    expect(byDate.get('2026-03-05')).toMatchObject({ status: 'present', missingPunch: true });
    expect(byDate.get('2026-03-06')?.status).toBe('weekend');

    const nightSun = (await attendance.list(db, { from: '2026-03-01', to: '2026-03-01', employeeId: nightWorker.id }))[0]!;
    expect(nightSun).toMatchObject({ status: 'present', checkInMinute: 1320, checkOutMinute: 1440 + 365, workedMinutes: 485 });

    // A hand correction survives a rebuild until it is reset.
    const thu = byDate.get('2026-03-05')!;
    const fixed = await attendance.updateDay(db, thu.id, { status: 'present', checkInMinute: 540, checkOutMinute: 1020, note: 'نسي يبصم' });
    expect(fixed).toMatchObject({ isManual: true, missingPunch: false, workedMinutes: 480 });
    const rebuilt = await attendance.rebuild(db, { from, to, employeeIds: [day.id] });
    expect(rebuilt.keptManual).toBe(1);
    expect((await attendance.list(db, { from: '2026-03-05', to: '2026-03-05', employeeId: day.id }))[0]).toMatchObject({ isManual: true, workedMinutes: 480 });
    expect(await attendance.resetDay(db, thu.id)).toMatchObject({ isManual: false, missingPunch: true });

    const summary = (await attendance.summary(db, { from, to, employeeId: day.id }))[0]!;
    expect(summary).toMatchObject({ workDays: 5, presentDays: 3, absentDays: 2, missingPunchDays: 1, lateMinutes: 40, overtimeMinutes: 50 });

    const exceptions = await attendance.list(db, { from, to, employeeId: day.id, exceptionsOnly: 'true' });
    expect(exceptions.map((d) => d.workDate).sort()).toEqual(['2026-03-02', '2026-03-04', '2026-03-05', '2026-03-07']);
  });
});
