import { sql, type Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { NumberingSequencesService } from '../../src/modules/settings/application/services/numbering-sequences.service';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { EmployeesService } from '../../src/modules/hr/application/employees.service';
import { HrOrgService } from '../../src/modules/hr/application/hr-org.service';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

/** HR step 1 (migration 0123): departments, job titles and the employee file. */
describe('HR core (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const org = new HrOrgService();
  let employees: EmployeesService;
  const s = uniqueSuffix();

  beforeAll(() => {
    db = openIntegrationDb();
    employees = new EmployeesService(new NumberingSequencesService(new KyselyNumberingSequenceRepository()));
  });

  afterAll(async () => {
    // Only this file's rows: other HR suites share the schema.
    const mine = db.selectFrom('hr_departments').select('id').where('name', 'like', `%${s}`);
    await db.updateTable('hr_departments').set({ manager_id: null }).where('name', 'like', `%${s}`).execute();
    await db.deleteFrom('employees').where((eb) => eb.or([eb('department_id', 'in', mine), eb('full_name', 'like', `%${s}`)])).execute();
    await db.deleteFrom('hr_departments').where('name', 'like', `%${s}`).where('parent_id', 'is not', null).execute();
    await db.deleteFrom('hr_departments').where('name', 'like', `%${s}`).execute();
    await db.deleteFrom('hr_job_titles').where('name', 'like', `%${s}`).execute();
    await db.destroy();
  });

  it('starts the module switched off and grants the permissions to the owner', async () => {
    const toggle = await db.selectFrom('tenant_feature_toggles').select('enabled').where('feature_key', '=', 'hr').executeTakeFirst();
    expect(toggle?.enabled).toBe(false);
    const keys = (await db.selectFrom('permissions').select('key').where('key', 'like', 'hr.%').execute()).map((r) => r.key).sort();
    expect(keys).toEqual(expect.arrayContaining(['hr.employees.manage', 'hr.employees.view']));
  });

  it('keeps the department tree free of loops and refuses to delete a used department', async () => {
    const top = await org.saveDepartment(db, null, { name: `Ops ${s}` });
    const child = await org.saveDepartment(db, null, { name: `Warehouse ${s}`, parentId: top.id });
    expect(child.parentName).toBe(`Ops ${s}`);
    await expect(org.saveDepartment(db, top.id, { name: top.name, parentId: child.id })).rejects.toMatchObject({
      code: 'HR_DEPARTMENT.PARENT_CYCLE',
    });
    await expect(org.saveDepartment(db, null, { name: `Ops ${s}` })).rejects.toMatchObject({ code: 'HR_DEPARTMENT.DUPLICATE_NAME' });
    await expect(org.deleteDepartment(db, top.id)).rejects.toMatchObject({ code: 'HR_DEPARTMENT.IN_USE' });
  });

  it('numbers a new employee, links the org structure and counts them', async () => {
    const department = await org.saveDepartment(db, null, { name: `Sales ${s}` });
    const job = await org.saveJobTitle(db, null, { name: `Rep ${s}` });
    const manager = await employees.create(db, {
      fullName: 'مدير المبيعات',
      hireDate: '2024-01-01',
      departmentId: department.id,
      employmentType: 'full_time',
      paymentMethod: 'bank',
      bankName: 'CIB',
      bankAccount: '123',
    });
    expect(manager.code).toMatch(/^EMP-\d{4}$/);
    expect(manager.bankName).toBe('CIB');

    const rep = await employees.create(db, {
      code: `R-${s}`,
      fullName: 'مندوب أول',
      nationalId: `2990101${s}`,
      hireDate: '2025-03-01',
      departmentId: department.id,
      jobTitleId: job.id,
      managerId: manager.id,
      employmentType: 'full_time',
      paymentMethod: 'cash',
      bankName: 'ignored for cash',
      customFields: { carPlate: 'أ ب ج 123' },
    });
    expect(rep).toMatchObject({ departmentName: `Sales ${s}`, jobTitleName: `Rep ${s}`, managerName: 'مدير المبيعات', bankName: null });
    expect(rep.customFields).toEqual({ carPlate: 'أ ب ج 123' });

    const listed = await employees.list(db, { departmentId: department.id });
    expect(listed.map((e) => e.id).sort()).toEqual([manager.id, rep.id].sort());
    expect((await employees.list(db, { search: 'مندوب' })).map((e) => e.id)).toContain(rep.id);
    expect((await org.listDepartments(db)).find((d) => d.id === department.id)?.employeeCount).toBe(2);

    // the reporting line stays a tree
    await expect(
      employees.update(db, manager.id, { fullName: manager.fullName, hireDate: manager.hireDate, managerId: rep.id, employmentType: 'full_time', paymentMethod: 'cash' }),
    ).rejects.toMatchObject({ code: 'EMPLOYEE.MANAGER_CYCLE' });
    // unique national ID and code
    await expect(
      employees.create(db, { fullName: 'نسخة', nationalId: `2990101${s}`, hireDate: '2025-01-01', employmentType: 'full_time', paymentMethod: 'cash' }),
    ).rejects.toMatchObject({ code: 'EMPLOYEE.DUPLICATE_NATIONAL_ID' });
    await expect(
      employees.create(db, { code: `R-${s}`, fullName: 'نسخة', hireDate: '2025-01-01', employmentType: 'full_time', paymentMethod: 'cash' }),
    ).rejects.toMatchObject({ code: 'EMPLOYEE.DUPLICATE_CODE' });
  });

  it('ends service, keeps the file read-only, and re-hires', async () => {
    const e = await employees.create(db, { fullName: `Temp ${s}`, hireDate: '2025-05-01', employmentType: 'temporary', paymentMethod: 'cash' });
    await expect(employees.changeStatus(db, e.id, { status: 'terminated', terminationDate: '2025-04-01' })).rejects.toMatchObject({
      code: 'EMPLOYEE.TERMINATION_BEFORE_HIRE',
    });
    const left = await employees.changeStatus(db, e.id, { status: 'terminated', terminationDate: '2026-01-31', terminationReason: 'انتهاء العقد' });
    expect(left).toMatchObject({ status: 'terminated', terminationDate: '2026-01-31', terminationReason: 'انتهاء العقد' });
    await expect(
      employees.update(db, e.id, { fullName: 'x', hireDate: e.hireDate, employmentType: 'temporary', paymentMethod: 'cash' }),
    ).rejects.toMatchObject({ code: 'EMPLOYEE.TERMINATED_READ_ONLY' });
    const back = await employees.changeStatus(db, e.id, { status: 'active' });
    expect(back).toMatchObject({ status: 'active', terminationDate: null, terminationReason: null });
  });

  it('accepts attachments on the employee file', async () => {
    const { rows } = await sql<{ def: string }>`
      SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
      WHERE c.conname = 'attachments_entity_type_whitelist' AND c.connamespace = current_schema()::regnamespace
    `.execute(db);
    expect(rows[0]?.def).toContain("'employee'");
  });
});
