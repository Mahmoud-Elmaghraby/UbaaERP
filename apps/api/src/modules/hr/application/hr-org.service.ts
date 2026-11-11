import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { HrDepartmentDto, HrJobTitleDto, SaveHrDepartmentDto, SaveHrJobTitleDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { BusinessRuleError, isPostgresForeignKeyViolation, isPostgresUniqueViolation } from '../../../shared/errors/domain-errors';
import { duplicateEntity, entityNotFound } from '../../../shared/errors/entity-errors';
import { wouldCreateCycle } from '../domain/hierarchy';

/** Departments (a tree) and job titles. Plain CRUD (CLAUDE.md §2.1: lookup tables). */
@Injectable()
export class HrOrgService {
  // ── departments ────────────────────────────────────────────────────────
  async listDepartments(db: Kysely<TenantDatabase>): Promise<HrDepartmentDto[]> {
    const rows = await this.departmentsQuery(db).orderBy('d.name').execute();
    return rows.map(toDepartmentDto);
  }

  async getDepartment(db: Kysely<TenantDatabase>, id: string): Promise<HrDepartmentDto> {
    const row = await this.departmentsQuery(db).where('d.id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('HR_DEPARTMENT', id);
    return toDepartmentDto(row);
  }

  async saveDepartment(db: Kysely<TenantDatabase>, id: string | null, input: SaveHrDepartmentDto): Promise<HrDepartmentDto> {
    const departmentId = id ?? randomUUID();
    const parentId = input.parentId ?? null;
    if (id) await this.getDepartment(db, id);
    if (parentId) {
      const links = await db.selectFrom('hr_departments').select(['id', 'parent_id']).execute();
      const parentOf = new Map(links.map((l) => [l.id, l.parent_id]));
      if (!parentOf.has(parentId)) throw entityNotFound('HR_DEPARTMENT', parentId);
      if (wouldCreateCycle(departmentId, parentId, parentOf)) {
        throw new BusinessRuleError('A department cannot sit under itself or one of its sub-departments.', {
          code: 'HR_DEPARTMENT.PARENT_CYCLE',
        });
      }
    }
    const values = { name: input.name, parent_id: parentId, manager_id: input.managerId ?? null, is_active: input.isActive ?? true };
    try {
      if (id) await db.updateTable('hr_departments').set({ ...values, updated_at: new Date() }).where('id', '=', id).execute();
      else await db.insertInto('hr_departments').values({ id: departmentId, ...values }).execute();
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('HR_DEPARTMENT', 'name', input.name);
      if (isPostgresForeignKeyViolation(err)) throw entityNotFound('EMPLOYEE', input.managerId ?? '');
      throw err;
    }
    return this.getDepartment(db, departmentId);
  }

  /** Only an empty department (no employees, no sub-departments); otherwise deactivate it. */
  async deleteDepartment(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const department = await this.getDepartment(db, id);
    try {
      await db.deleteFrom('hr_departments').where('id', '=', id).execute();
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new BusinessRuleError(`Department "${department.name}" has employees or sub-departments.`, {
          code: 'HR_DEPARTMENT.IN_USE',
          params: { name: department.name },
        });
      }
      throw err;
    }
  }

  // ── job titles ─────────────────────────────────────────────────────────
  async listJobTitles(db: Kysely<TenantDatabase>): Promise<HrJobTitleDto[]> {
    const rows = await this.jobTitlesQuery(db).orderBy('j.is_active', 'desc').orderBy('j.name').execute();
    return rows.map(toJobTitleDto);
  }

  async getJobTitle(db: Kysely<TenantDatabase>, id: string): Promise<HrJobTitleDto> {
    const row = await this.jobTitlesQuery(db).where('j.id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('HR_JOB_TITLE', id);
    return toJobTitleDto(row);
  }

  async saveJobTitle(db: Kysely<TenantDatabase>, id: string | null, input: SaveHrJobTitleDto): Promise<HrJobTitleDto> {
    const jobTitleId = id ?? randomUUID();
    const values = { name: input.name, description: input.description?.trim() || null, is_active: input.isActive ?? true };
    try {
      if (id) {
        const updated = await db.updateTable('hr_job_titles').set({ ...values, updated_at: new Date() }).where('id', '=', id).executeTakeFirst();
        if (!updated.numUpdatedRows) throw entityNotFound('HR_JOB_TITLE', id);
      } else {
        await db.insertInto('hr_job_titles').values({ id: jobTitleId, ...values }).execute();
      }
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('HR_JOB_TITLE', 'name', input.name);
      throw err;
    }
    return this.getJobTitle(db, jobTitleId);
  }

  async deleteJobTitle(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const jobTitle = await this.getJobTitle(db, id);
    try {
      await db.deleteFrom('hr_job_titles').where('id', '=', id).execute();
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new BusinessRuleError(`Job title "${jobTitle.name}" is used by employees.`, {
          code: 'HR_JOB_TITLE.IN_USE',
          params: { name: jobTitle.name },
        });
      }
      throw err;
    }
  }

  private departmentsQuery(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('hr_departments as d')
      .leftJoin('hr_departments as p', 'p.id', 'd.parent_id')
      .leftJoin('employees as m', 'm.id', 'd.manager_id')
      .select([
        'd.id',
        'd.name',
        'd.parent_id',
        'p.name as parent_name',
        'd.manager_id',
        'm.full_name as manager_name',
        'd.is_active',
        sql<string>`(SELECT count(*) FROM employees e WHERE e.department_id = d.id AND e.status <> 'terminated')`.as('employee_count'),
      ]);
  }

  private jobTitlesQuery(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('hr_job_titles as j')
      .select([
        'j.id',
        'j.name',
        'j.description',
        'j.is_active',
        sql<string>`(SELECT count(*) FROM employees e WHERE e.job_title_id = j.id AND e.status <> 'terminated')`.as('employee_count'),
      ]);
  }
}

function toDepartmentDto(row: {
  id: string;
  name: string;
  parent_id: string | null;
  parent_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  is_active: boolean;
  employee_count: string;
}): HrDepartmentDto {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    parentName: row.parent_name,
    managerId: row.manager_id,
    managerName: row.manager_name,
    isActive: row.is_active,
    employeeCount: Number(row.employee_count),
  };
}

function toJobTitleDto(row: { id: string; name: string; description: string | null; is_active: boolean; employee_count: string }): HrJobTitleDto {
  return { id: row.id, name: row.name, description: row.description, isActive: row.is_active, employeeCount: Number(row.employee_count) };
}
