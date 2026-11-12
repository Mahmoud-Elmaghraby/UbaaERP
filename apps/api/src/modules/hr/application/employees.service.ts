import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type {
  ChangeEmployeeStatusDto,
  EmployeeDto,
  EmployeeListQueryDto,
  EmployeeStatusDto,
  EmployeeSummaryDto,
  EmploymentTypeDto,
  GenderDto,
  SalaryPaymentMethodDto,
  SaveEmployeeDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { BusinessRuleError, isPostgresForeignKeyViolation, isPostgresUniqueViolation } from '../../../shared/errors/domain-errors';
import { duplicateEntity, entityNotFound } from '../../../shared/errors/entity-errors';
import { NumberingSequencesService } from '../../settings/application/services/numbering-sequences.service';
import { wouldCreateCycle } from '../domain/hierarchy';
import { planStatusChange, type EmployeeStatus } from '../domain/employee-status';

/**
 * The employee file (ملف الموظف). Master data, so no aggregate (CLAUDE.md §2.1), but the reporting
 * line is kept a tree and the end-of-service state stays consistent (domain/).
 */
@Injectable()
export class EmployeesService {
  constructor(private readonly numbering: NumberingSequencesService) {}

  async list(db: Kysely<TenantDatabase>, query: EmployeeListQueryDto = {}): Promise<EmployeeSummaryDto[]> {
    let q = this.base(db);
    if (query.status) q = q.where('e.status', '=', query.status);
    if (query.branchId) q = q.where('e.branch_id', '=', query.branchId);
    if (query.departmentId) q = q.where('e.department_id', '=', query.departmentId);
    if (query.jobTitleId) q = q.where('e.job_title_id', '=', query.jobTitleId);
    if (query.search) {
      const term = `%${query.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      q = q.where((eb) =>
        eb.or([eb('e.full_name', 'ilike', term), eb('e.code', 'ilike', term), eb('e.phone', 'ilike', term), eb('e.national_id', 'ilike', term)]),
      );
    }
    const rows = await q.orderBy('e.code').execute();
    return rows.map(toSummary);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<EmployeeDto> {
    const row = await this.base(db)
      .leftJoin('users as u', 'u.id', 'e.user_id')
      .leftJoin('hr_shifts as sh', 'sh.id', 'e.shift_id')
      .select([
        'e.national_id',
        'e.national_id_expiry',
        'e.gender',
        'e.birth_date',
        'e.email',
        'e.address',
        'e.emergency_contact_name',
        'e.emergency_contact_phone',
        'e.user_id',
        'u.full_name as user_name',
        'e.shift_id',
        'sh.name as shift_name',
        'e.attendance_code',
        'e.termination_date',
        'e.termination_reason',
        'e.payment_method',
        'e.bank_name',
        'e.bank_account',
        'e.notes',
        'e.custom_fields',
        'e.created_at',
        'e.updated_at',
      ])
      .where('e.id', '=', id)
      .executeTakeFirst();
    if (!row) throw entityNotFound('EMPLOYEE', id);
    return {
      ...toSummary(row),
      nationalId: row.national_id,
      nationalIdExpiry: row.national_id_expiry,
      gender: row.gender as GenderDto | null,
      birthDate: row.birth_date,
      email: row.email,
      address: row.address,
      emergencyContactName: row.emergency_contact_name,
      emergencyContactPhone: row.emergency_contact_phone,
      userId: row.user_id,
      userName: row.user_name,
      shiftId: row.shift_id,
      shiftName: row.shift_name,
      attendanceCode: row.attendance_code,
      terminationDate: row.termination_date,
      terminationReason: row.termination_reason,
      paymentMethod: row.payment_method as SalaryPaymentMethodDto,
      bankName: row.bank_name,
      bankAccount: row.bank_account,
      notes: row.notes,
      customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async create(db: Kysely<TenantDatabase>, input: SaveEmployeeDto): Promise<EmployeeDto> {
    const id = randomUUID();
    await this.assertManager(db, id, input.managerId ?? null);
    // An empty code takes the next 'employee' number (Settings › Numbering).
    const code =
      input.code?.trim() ||
      (await this.numbering.allocateCode(db, 'employee', async (candidate) =>
        Boolean(await db.selectFrom('employees').select('id').where('code', '=', candidate).executeTakeFirst()),
      ));
    await this.write(db, input, code, () =>
      db
        .insertInto('employees')
        .values({ id, code, ...columns(input) })
        .execute(),
    );
    return this.getById(db, id);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: SaveEmployeeDto): Promise<EmployeeDto> {
    const existing = await this.getById(db, id);
    if (existing.status === 'terminated') {
      throw new BusinessRuleError('The employee has left — reactivate them before editing the file.', {
        code: 'EMPLOYEE.TERMINATED_READ_ONLY',
      });
    }
    await this.assertManager(db, id, input.managerId ?? null);
    const code = input.code?.trim() || existing.code;
    await this.write(db, input, code, () =>
      db
        .updateTable('employees')
        .set({ code, ...columns(input), updated_at: new Date() })
        .where('id', '=', id)
        .execute(),
    );
    return this.getById(db, id);
  }

  async changeStatus(db: Kysely<TenantDatabase>, id: string, input: ChangeEmployeeStatusDto): Promise<EmployeeDto> {
    const existing = await this.getById(db, id);
    const next = planStatusChange(existing.status as EmployeeStatus, existing.hireDate, input);
    await db
      .updateTable('employees')
      .set({ ...next, updated_at: new Date() })
      .where('id', '=', id)
      .execute();
    return this.getById(db, id);
  }

  /** Only a file nothing else points at; otherwise end the employee's service instead. */
  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await this.getById(db, id);
    try {
      await db.deleteFrom('employees').where('id', '=', id).execute();
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new BusinessRuleError('The employee is referenced by other records — end their service instead.', { code: 'EMPLOYEE.IN_USE' });
      }
      throw err;
    }
  }

  /** The manager must be an existing, non-terminated employee outside this employee's own team. */
  private async assertManager(db: Kysely<TenantDatabase>, employeeId: string, managerId: string | null): Promise<void> {
    if (!managerId) return;
    const links = await db.selectFrom('employees').select(['id', 'manager_id', 'full_name', 'status']).execute();
    const manager = links.find((l) => l.id === managerId);
    if (!manager) throw entityNotFound('EMPLOYEE', managerId);
    if (manager.status === 'terminated') {
      throw new BusinessRuleError(`"${manager.full_name}" is not an active employee.`, {
        code: 'EMPLOYEE.MANAGER_NOT_ACTIVE',
        params: { name: manager.full_name },
      });
    }
    const parentOf = new Map(links.map((l) => [l.id, l.manager_id]));
    if (wouldCreateCycle(employeeId, managerId, parentOf)) {
      throw new BusinessRuleError(`"${manager.full_name}" reports to this employee.`, {
        code: 'EMPLOYEE.MANAGER_CYCLE',
        params: { name: manager.full_name },
      });
    }
  }

  private async write(db: Kysely<TenantDatabase>, input: SaveEmployeeDto, code: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (err) {
      const constraint = String((err as { constraint?: unknown }).constraint ?? '');
      if (isPostgresUniqueViolation(err)) {
        if (constraint.includes('national_id')) throw duplicateEntity('EMPLOYEE', 'national_id', input.nationalId ?? '');
        if (constraint.includes('attendance_code')) {
          throw duplicateEntity('EMPLOYEE', 'attendance_code', input.attendanceCode ?? '');
        }
        if (constraint.includes('user_id')) {
          throw new BusinessRuleError('This user is already linked to another employee.', { code: 'EMPLOYEE.DUPLICATE_USER' });
        }
        throw duplicateEntity('EMPLOYEE', 'code', code);
      }
      if (isPostgresForeignKeyViolation(err)) {
        throw new BusinessRuleError('A linked branch, department, job title, shift or user does not exist.', { code: 'EMPLOYEE.LINK_NOT_FOUND' });
      }
      throw err;
    }
  }

  private base(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('employees as e')
      .leftJoin('branches as b', 'b.id', 'e.branch_id')
      .leftJoin('hr_departments as d', 'd.id', 'e.department_id')
      .leftJoin('hr_job_titles as j', 'j.id', 'e.job_title_id')
      .leftJoin('employees as m', 'm.id', 'e.manager_id')
      .select([
        'e.id',
        'e.code',
        'e.full_name',
        'e.phone',
        'e.branch_id',
        'b.name as branch_name',
        'e.department_id',
        'd.name as department_name',
        'e.job_title_id',
        'j.name as job_title_name',
        'e.manager_id',
        'm.full_name as manager_name',
        'e.hire_date',
        'e.employment_type',
        'e.status',
      ]);
  }
}

function columns(input: SaveEmployeeDto) {
  const text = (v: string | null | undefined) => v?.trim() || null;
  const isBankLike = input.paymentMethod !== 'cash';
  return {
    full_name: input.fullName.trim(),
    national_id: text(input.nationalId),
    national_id_expiry: input.nationalIdExpiry ?? null,
    gender: input.gender ?? null,
    birth_date: input.birthDate ?? null,
    phone: text(input.phone),
    email: text(input.email),
    address: text(input.address),
    emergency_contact_name: text(input.emergencyContactName),
    emergency_contact_phone: text(input.emergencyContactPhone),
    branch_id: input.branchId ?? null,
    department_id: input.departmentId ?? null,
    job_title_id: input.jobTitleId ?? null,
    manager_id: input.managerId ?? null,
    user_id: input.userId ?? null,
    shift_id: input.shiftId ?? null,
    attendance_code: text(input.attendanceCode),
    hire_date: input.hireDate,
    employment_type: input.employmentType,
    payment_method: input.paymentMethod,
    // A cash-paid employee keeps no stale bank details.
    bank_name: isBankLike ? text(input.bankName) : null,
    bank_account: isBankLike ? text(input.bankAccount) : null,
    notes: text(input.notes),
    custom_fields: JSON.stringify(input.customFields ?? {}),
  };
}

function toSummary(row: {
  id: string;
  code: string;
  full_name: string;
  phone: string | null;
  branch_id: string | null;
  branch_name: string | null;
  department_id: string | null;
  department_name: string | null;
  job_title_id: string | null;
  job_title_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  hire_date: string;
  employment_type: string;
  status: string;
}): EmployeeSummaryDto {
  return {
    id: row.id,
    code: row.code,
    fullName: row.full_name,
    phone: row.phone,
    branchId: row.branch_id,
    branchName: row.branch_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    jobTitleId: row.job_title_id,
    jobTitleName: row.job_title_name,
    managerId: row.manager_id,
    managerName: row.manager_name,
    hireDate: row.hire_date,
    employmentType: row.employment_type as EmploymentTypeDto,
    status: row.status as EmployeeStatusDto,
  };
}
