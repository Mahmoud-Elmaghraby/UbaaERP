import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { EmployeesService } from '../../src/modules/hr/application/employees.service';
import { SalaryComponentsService } from '../../src/modules/hr/application/salary-components.service';
import { EmployeeSalariesService } from '../../src/modules/hr/application/employee-salaries.service';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** HR step 2 (migration 0124): salary components and salary history. */
describe('HR salaries (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  let employees: EmployeesService;
  const components = new SalaryComponentsService();
  const salaries = new EmployeeSalariesService();
  const s = uniqueSuffix();

  beforeAll(() => {
    db = openIntegrationDb();
    employees = new EmployeesService(new NumberingSequencesService(new KyselyNumberingSequenceRepository()));
  });

  afterAll(async () => {
    const mine = db.selectFrom('employees').select('id').where('full_name', 'like', `%${s}`);
    await db.deleteFrom('hr_employee_salaries').where('employee_id', 'in', mine).execute();
    await db.deleteFrom('hr_salary_components').where('name', 'like', `%${s}`).execute();
    await db.deleteFrom('employees').where('full_name', 'like', `%${s}`).execute();
    await db.destroy();
  });

  it('keeps a salary history, computes it, and answers the register on any date', async () => {
    const housing = await components.save(db, null, { name: `سكن ${s}`, kind: 'earning', calculation: 'percent_of_basic', defaultPercent: 10 });
    const transport = await components.save(db, null, { name: `انتقال ${s}`, kind: 'earning', calculation: 'fixed', defaultAmountMinorUnits: '50000' });
    const union = await components.save(db, null, { name: `نقابة ${s}`, kind: 'deduction', calculation: 'fixed', defaultAmountMinorUnits: '2500' });
    expect(housing.defaultPercent).toBe(10);

    const e = await employees.create(db, { fullName: `محمد ${s}`, hireDate: '2025-01-01', employmentType: 'full_time', paymentMethod: 'cash' });
    await expect(salaries.create(db, e.id, { effectiveFrom: '2024-12-01', basicMinorUnits: '100', lines: [] }, null)).rejects.toMatchObject({
      code: 'HR_SALARY.BEFORE_HIRE',
    });

    // January: basic 8,000 + housing 10% (default) + transport (default) − union
    await salaries.create(
      db,
      e.id,
      {
        effectiveFrom: '2025-01-01',
        basicMinorUnits: '800000',
        lines: [{ componentId: housing.id }, { componentId: transport.id }, { componentId: union.id }],
      },
      null,
    );
    // July raise: basic 10,000, housing 12.5%, transport dropped
    const after = await salaries.create(
      db,
      e.id,
      { effectiveFrom: '2025-07-01', basicMinorUnits: '1000000', lines: [{ componentId: housing.id, percent: 12.5 }, { componentId: union.id }] },
      null,
    );
    expect(after.history.map((h) => [h.effectiveFrom, h.effectiveTo])).toEqual([
      ['2025-07-01', null],
      ['2025-01-01', '2025-07-01'],
    ]);
    expect(after.current).toMatchObject({ basicMinorUnits: '1000000', earningsMinorUnits: '125000', deductionsMinorUnits: '2500', netMinorUnits: '1122500' });
    const jan = after.history[1]!;
    expect(jan.lines.map((l) => [l.componentName, l.valueMinorUnits])).toEqual(
      expect.arrayContaining([
        [`سكن ${s}`, '80000'],
        [`انتقال ${s}`, '50000'],
        [`نقابة ${s}`, '2500'],
      ]),
    );
    expect(jan.netMinorUnits).toBe('927500');

    await expect(
      salaries.create(db, e.id, { effectiveFrom: '2025-07-01', basicMinorUnits: '1', lines: [] }, null),
    ).rejects.toMatchObject({ code: 'HR_SALARY.DUPLICATE_DATE' });

    const march = await salaries.register(db, { asOf: '2025-03-15' });
    expect(march.rows.find((r) => r.employeeId === e.id)).toMatchObject({ effectiveFrom: '2025-01-01', netMinorUnits: '927500' });
    const now = await salaries.register(db, {});
    expect(now.rows.find((r) => r.employeeId === e.id)?.netMinorUnits).toBe('1122500');

    // a used component keeps its meaning and can't be deleted; an inactive one can't be added
    await expect(components.save(db, union.id, { name: union.name, kind: 'earning', calculation: 'fixed' })).rejects.toMatchObject({
      code: 'HR_SALARY_COMPONENT.TYPE_LOCKED',
    });
    await expect(components.delete(db, union.id)).rejects.toMatchObject({ code: 'HR_SALARY_COMPONENT.IN_USE' });
    await components.save(db, transport.id, { name: transport.name, kind: 'earning', calculation: 'fixed', defaultAmountMinorUnits: '50000', isActive: false });
    await expect(
      salaries.create(db, e.id, { effectiveFrom: '2026-01-01', basicMinorUnits: '1', lines: [{ componentId: transport.id }] }, null),
    ).rejects.toMatchObject({ code: 'HR_SALARY_COMPONENT.INACTIVE' });
    // …but a revision that already had it keeps it on edit
    const edited = await salaries.update(db, e.id, jan.id, {
      effectiveFrom: '2025-01-01',
      basicMinorUnits: '900000',
      lines: [{ componentId: transport.id, amountMinorUnits: '60000' }],
    });
    expect(edited.history[1]).toMatchObject({ basicMinorUnits: '900000', netMinorUnits: '960000' });

    // deleting the latest revision makes the earlier one current again
    const back = await salaries.delete(db, e.id, after.current!.id);
    expect(back.current?.effectiveFrom).toBe('2025-01-01');
    expect(back.current?.effectiveTo).toBeNull();
  });
});
