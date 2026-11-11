import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type {
  SalaryComponentCalculationDto,
  SalaryComponentDto,
  SalaryComponentKindDto,
  SaveSalaryComponentDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { BusinessRuleError, isPostgresForeignKeyViolation, isPostgresUniqueViolation } from '../../../shared/errors/domain-errors';
import { duplicateEntity, entityNotFound } from '../../../shared/errors/entity-errors';

/** Salary components (البدلات والاستقطاعات). Plain CRUD. */
@Injectable()
export class SalaryComponentsService {
  async list(db: Kysely<TenantDatabase>): Promise<SalaryComponentDto[]> {
    const rows = await this.query(db).orderBy('c.is_active', 'desc').orderBy('c.kind').orderBy('c.name').execute();
    return rows.map(toDto);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<SalaryComponentDto> {
    const row = await this.query(db).where('c.id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('HR_SALARY_COMPONENT', id);
    return toDto(row);
  }

  async save(db: Kysely<TenantDatabase>, id: string | null, input: SaveSalaryComponentDto): Promise<SalaryComponentDto> {
    const componentId = id ?? randomUUID();
    if (id) {
      const existing = await this.getById(db, id);
      // Changing what a used component means would silently rewrite every salary that carries it.
      if (existing.employeeCount > 0 && (existing.kind !== input.kind || existing.calculation !== input.calculation)) {
        throw new BusinessRuleError(`Component "${existing.name}" is on salaries — its type can't change.`, {
          code: 'HR_SALARY_COMPONENT.TYPE_LOCKED',
          params: { name: existing.name },
        });
      }
    }
    const fixed = input.calculation === 'fixed';
    const values = {
      name: input.name,
      kind: input.kind,
      calculation: input.calculation,
      default_amount_minor: fixed ? (input.defaultAmountMinorUnits ?? null) : null,
      default_percent: fixed || input.defaultPercent == null ? null : String(input.defaultPercent),
      is_active: input.isActive ?? true,
    };
    try {
      if (id) await db.updateTable('hr_salary_components').set({ ...values, updated_at: new Date() }).where('id', '=', id).execute();
      else await db.insertInto('hr_salary_components').values({ id: componentId, ...values }).execute();
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('HR_SALARY_COMPONENT', 'name', input.name);
      throw err;
    }
    return this.getById(db, componentId);
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const component = await this.getById(db, id);
    try {
      await db.deleteFrom('hr_salary_components').where('id', '=', id).execute();
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new BusinessRuleError(`Component "${component.name}" is on salaries.`, {
          code: 'HR_SALARY_COMPONENT.IN_USE',
          params: { name: component.name },
        });
      }
      throw err;
    }
  }

  private query(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('hr_salary_components as c')
      .select([
        'c.id',
        'c.name',
        'c.kind',
        'c.calculation',
        'c.default_amount_minor',
        'c.default_percent',
        'c.is_active',
        sql<string>`(
          SELECT count(DISTINCT s.employee_id) FROM hr_employee_salary_lines l
          JOIN hr_employee_salaries s ON s.id = l.salary_id WHERE l.component_id = c.id
        )`.as('employee_count'),
      ]);
  }
}

function toDto(row: {
  id: string;
  name: string;
  kind: string;
  calculation: string;
  default_amount_minor: string | null;
  default_percent: string | null;
  is_active: boolean;
  employee_count: string;
}): SalaryComponentDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as SalaryComponentKindDto,
    calculation: row.calculation as SalaryComponentCalculationDto,
    defaultAmountMinorUnits: row.default_amount_minor,
    defaultPercent: row.default_percent === null ? null : Number(row.default_percent),
    isActive: row.is_active,
    employeeCount: Number(row.employee_count),
  };
}
