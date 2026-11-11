import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type {
  EmployeeSalaryDto,
  EmployeeSalaryHistoryDto,
  EmployeeStatusDto,
  SalaryComponentCalculationDto,
  SalaryComponentKindDto,
  SalaryRegisterDto,
  SalaryRegisterQueryDto,
  SaveEmployeeSalaryDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { withTransaction } from '../../../database/tenant/transaction.util';
import { BusinessRuleError, isPostgresUniqueViolation } from '../../../shared/errors/domain-errors';
import { entityNotFound } from '../../../shared/errors/entity-errors';
import { computeSalary, normaliseLineValue, type SalaryLineInput } from '../domain/salary';

interface RevisionRow {
  id: string;
  employee_id: string;
  effective_from: string;
  basic_minor: string;
  notes: string | null;
  created_at: Date;
  created_by_name: string | null;
}

interface LineRow {
  salary_id: string;
  component_id: string;
  component_name: string;
  kind: string;
  calculation: string;
  amount_minor: string | null;
  percent: string | null;
}

/**
 * Each employee's salary history (تاريخ المرتب): a revision is in force from its date until the next
 * one. Amounts in the company currency (Money VO). Revisions stay editable until the payroll run
 * (a later step) locks the months it has paid.
 */
@Injectable()
export class EmployeeSalariesService {
  async history(db: Kysely<TenantDatabase>, employeeId: string, asOf = today()): Promise<EmployeeSalaryHistoryDto> {
    await this.requireEmployee(db, employeeId);
    const currency = await companyCurrency(db);
    const revisions = await this.revisionsQuery(db).where('s.employee_id', '=', employeeId).orderBy('s.effective_from', 'desc').execute();
    const lines = await this.linesFor(db, revisions.map((r) => r.id));
    const history = revisions.map((r, i) => toDto(r, lines.get(r.id) ?? [], currency, i === 0 ? null : revisions[i - 1]!.effective_from));
    return { current: history.find((h) => h.effectiveFrom <= asOf) ?? null, history };
  }

  async create(db: Kysely<TenantDatabase>, employeeId: string, input: SaveEmployeeSalaryDto, userId: string | null): Promise<EmployeeSalaryHistoryDto> {
    const employee = await this.requireEmployee(db, employeeId);
    this.assertWritable(employee, input.effectiveFrom);
    const lines = await this.resolveLines(db, input, new Set());
    await withTransaction(db, async (trx) => {
      const id = randomUUID();
      try {
        await trx
          .insertInto('hr_employee_salaries')
          .values({ id, employee_id: employeeId, effective_from: input.effectiveFrom, basic_minor: input.basicMinorUnits, notes: input.notes?.trim() || null, created_by: userId })
          .execute();
      } catch (err) {
        if (isPostgresUniqueViolation(err)) throw duplicateDate(input.effectiveFrom);
        throw err;
      }
      await insertLines(trx, id, lines);
    });
    return this.history(db, employeeId);
  }

  async update(db: Kysely<TenantDatabase>, employeeId: string, salaryId: string, input: SaveEmployeeSalaryDto): Promise<EmployeeSalaryHistoryDto> {
    const employee = await this.requireEmployee(db, employeeId);
    this.assertWritable(employee, input.effectiveFrom);
    await this.requireRevision(db, employeeId, salaryId);
    // Components already on this revision may stay even if deactivated since.
    const kept = new Set(
      (await db.selectFrom('hr_employee_salary_lines').select('component_id').where('salary_id', '=', salaryId).execute()).map((l) => l.component_id),
    );
    const lines = await this.resolveLines(db, input, kept);
    await withTransaction(db, async (trx) => {
      try {
        await trx
          .updateTable('hr_employee_salaries')
          .set({ effective_from: input.effectiveFrom, basic_minor: input.basicMinorUnits, notes: input.notes?.trim() || null, updated_at: new Date() })
          .where('id', '=', salaryId)
          .execute();
      } catch (err) {
        if (isPostgresUniqueViolation(err)) throw duplicateDate(input.effectiveFrom);
        throw err;
      }
      await trx.deleteFrom('hr_employee_salary_lines').where('salary_id', '=', salaryId).execute();
      await insertLines(trx, salaryId, lines);
    });
    return this.history(db, employeeId);
  }

  async delete(db: Kysely<TenantDatabase>, employeeId: string, salaryId: string): Promise<EmployeeSalaryHistoryDto> {
    const employee = await this.requireEmployee(db, employeeId);
    if (employee.status === 'terminated') throw terminatedReadOnly();
    await this.requireRevision(db, employeeId, salaryId);
    await db.deleteFrom('hr_employee_salaries').where('id', '=', salaryId).execute();
    return this.history(db, employeeId);
  }

  /** كشف المرتبات: every employee's salary in force on `asOf`, with totals. */
  async register(db: Kysely<TenantDatabase>, query: SalaryRegisterQueryDto = {}): Promise<SalaryRegisterDto> {
    const asOf = query.asOf ?? today();
    const currency = await companyCurrency(db);
    let employeesQuery = db
      .selectFrom('employees as e')
      .leftJoin('hr_departments as d', 'd.id', 'e.department_id')
      .leftJoin('hr_job_titles as j', 'j.id', 'e.job_title_id')
      .select(['e.id', 'e.code', 'e.full_name', 'e.status', 'd.name as department_name', 'j.name as job_title_name'])
      .where('e.hire_date', '<=', asOf);
    if (query.includeTerminated !== 'true') employeesQuery = employeesQuery.where('e.status', '<>', 'terminated');
    if (query.departmentId) employeesQuery = employeesQuery.where('e.department_id', '=', query.departmentId);
    const employees = await employeesQuery.orderBy('e.code').execute();

    const ids = employees.map((e) => e.id);
    const revisions = ids.length
      ? await this.revisionsQuery(db)
          .where('s.employee_id', 'in', ids)
          .where('s.effective_from', '<=', asOf)
          .where(({ eb, selectFrom }) =>
            eb(
              's.effective_from',
              '=',
              selectFrom('hr_employee_salaries as s2')
                .select(sql<string>`max(s2.effective_from)`.as('m'))
                .whereRef('s2.employee_id', '=', 's.employee_id')
                .where('s2.effective_from', '<=', asOf),
            ),
          )
          .execute()
      : [];
    const lines = await this.linesFor(db, revisions.map((r) => r.id));
    const byEmployee = new Map(revisions.map((r) => [r.employee_id, toDto(r, lines.get(r.id) ?? [], currency, null)]));

    const zero = Money.zero(currency);
    let basic = zero;
    let earnings = zero;
    let deductions = zero;
    let net = zero;
    const rows = employees.map((e) => {
      const salary = byEmployee.get(e.id) ?? null;
      if (salary) {
        basic = basic.add(money(salary.basicMinorUnits, currency));
        earnings = earnings.add(money(salary.earningsMinorUnits, currency));
        deductions = deductions.add(money(salary.deductionsMinorUnits, currency));
        net = net.add(money(salary.netMinorUnits, currency));
      }
      return {
        employeeId: e.id,
        code: e.code,
        fullName: e.full_name,
        departmentName: e.department_name,
        jobTitleName: e.job_title_name,
        status: e.status as EmployeeStatusDto,
        effectiveFrom: salary?.effectiveFrom ?? null,
        basicMinorUnits: salary?.basicMinorUnits ?? null,
        earningsMinorUnits: salary?.earningsMinorUnits ?? null,
        deductionsMinorUnits: salary?.deductionsMinorUnits ?? null,
        netMinorUnits: salary?.netMinorUnits ?? null,
      };
    });
    return {
      asOf,
      currency,
      rows,
      totals: {
        basicMinorUnits: basic.toMinorUnits().toString(),
        earningsMinorUnits: earnings.toMinorUnits().toString(),
        deductionsMinorUnits: deductions.toMinorUnits().toString(),
        netMinorUnits: net.toMinorUnits().toString(),
      },
      withoutSalary: rows.filter((r) => r.effectiveFrom === null).length,
    };
  }

  private assertWritable(employee: { status: string; hire_date: string }, effectiveFrom: string): void {
    if (employee.status === 'terminated') throw terminatedReadOnly();
    if (effectiveFrom < employee.hire_date) {
      throw new BusinessRuleError('A salary cannot start before the hire date.', { code: 'HR_SALARY.BEFORE_HIRE', params: { date: employee.hire_date } });
    }
  }

  /** The entered lines checked against the catalog: existing, active (unless kept), one value each. */
  private async resolveLines(db: Kysely<TenantDatabase>, input: SaveEmployeeSalaryDto, kept: ReadonlySet<string>) {
    if (input.lines.length === 0) return [];
    const components = await db
      .selectFrom('hr_salary_components')
      .selectAll()
      .where('id', 'in', input.lines.map((l) => l.componentId))
      .execute();
    const byId = new Map(components.map((c) => [c.id, c]));
    return input.lines.map((line) => {
      const component = byId.get(line.componentId);
      if (!component) throw entityNotFound('HR_SALARY_COMPONENT', line.componentId);
      if (!component.is_active && !kept.has(component.id)) {
        throw new BusinessRuleError(`Component "${component.name}" is inactive.`, {
          code: 'HR_SALARY_COMPONENT.INACTIVE',
          params: { name: component.name },
        });
      }
      const value = normaliseLineValue(
        component.calculation as SalaryComponentCalculationDto,
        { amount: line.amountMinorUnits == null ? null : BigInt(line.amountMinorUnits), percent: line.percent ?? null },
        {
          amount: component.default_amount_minor === null ? null : BigInt(component.default_amount_minor),
          percent: component.default_percent === null ? null : Number(component.default_percent),
        },
      );
      return { componentId: component.id, ...value };
    });
  }

  private async requireEmployee(db: Kysely<TenantDatabase>, id: string) {
    const employee = await db.selectFrom('employees').select(['id', 'status', 'hire_date']).where('id', '=', id).executeTakeFirst();
    if (!employee) throw entityNotFound('EMPLOYEE', id);
    return employee;
  }

  private async requireRevision(db: Kysely<TenantDatabase>, employeeId: string, salaryId: string): Promise<void> {
    const row = await db
      .selectFrom('hr_employee_salaries')
      .select('id')
      .where('id', '=', salaryId)
      .where('employee_id', '=', employeeId)
      .executeTakeFirst();
    if (!row) throw entityNotFound('HR_EMPLOYEE_SALARY', salaryId);
  }

  private revisionsQuery(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('hr_employee_salaries as s')
      .leftJoin('users as u', 'u.id', 's.created_by')
      .select(['s.id', 's.employee_id', 's.effective_from', 's.basic_minor', 's.notes', 's.created_at', 'u.full_name as created_by_name']);
  }

  private async linesFor(db: Kysely<TenantDatabase>, salaryIds: string[]): Promise<Map<string, LineRow[]>> {
    const map = new Map<string, LineRow[]>();
    if (salaryIds.length === 0) return map;
    const rows = await db
      .selectFrom('hr_employee_salary_lines as l')
      .innerJoin('hr_salary_components as c', 'c.id', 'l.component_id')
      .select(['l.salary_id', 'l.component_id', 'c.name as component_name', 'c.kind', 'c.calculation', 'l.amount_minor', 'l.percent'])
      .where('l.salary_id', 'in', salaryIds)
      .orderBy('c.kind')
      .orderBy('c.name')
      .execute();
    for (const row of rows) map.set(row.salary_id, [...(map.get(row.salary_id) ?? []), row]);
    return map;
  }
}

async function insertLines(
  trx: Kysely<TenantDatabase>,
  salaryId: string,
  lines: { componentId: string; amount: bigint | null; percent: number | null }[],
): Promise<void> {
  if (lines.length === 0) return;
  await trx
    .insertInto('hr_employee_salary_lines')
    .values(
      lines.map((l) => ({
        id: randomUUID(),
        salary_id: salaryId,
        component_id: l.componentId,
        amount_minor: l.amount === null ? null : l.amount.toString(),
        percent: l.percent === null ? null : String(l.percent),
      })),
    )
    .execute();
}

function toDto(row: RevisionRow, lines: LineRow[], currency: string, effectiveTo: string | null): EmployeeSalaryDto {
  const inputs: SalaryLineInput[] = lines.map((l) => ({
    componentId: l.component_id,
    kind: l.kind as SalaryComponentKindDto,
    calculation: l.calculation as SalaryComponentCalculationDto,
    amount: l.amount_minor === null ? null : money(l.amount_minor, currency),
    percent: l.percent === null ? null : Number(l.percent),
  }));
  const breakdown = computeSalary(money(row.basic_minor, currency), inputs);
  return {
    id: row.id,
    employeeId: row.employee_id,
    effectiveFrom: row.effective_from,
    effectiveTo,
    basicMinorUnits: row.basic_minor,
    lines: breakdown.lines.map((l, i) => ({
      componentId: l.componentId,
      componentName: lines[i]!.component_name,
      kind: l.kind,
      calculation: l.calculation,
      amountMinorUnits: l.amount ? l.amount.toMinorUnits().toString() : null,
      percent: l.percent,
      valueMinorUnits: l.value.toMinorUnits().toString(),
    })),
    earningsMinorUnits: breakdown.earnings.toMinorUnits().toString(),
    deductionsMinorUnits: breakdown.deductions.toMinorUnits().toString(),
    grossMinorUnits: breakdown.gross.toMinorUnits().toString(),
    netMinorUnits: breakdown.net.toMinorUnits().toString(),
    currency,
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    createdByName: row.created_by_name,
  };
}

function money(minor: string, currency: string): Money {
  return Money.fromMinorUnits(BigInt(minor), currency);
}

async function companyCurrency(db: Kysely<TenantDatabase>): Promise<string> {
  const row = await db.selectFrom('tenant_settings').select('currency_code').executeTakeFirst();
  return row?.currency_code ?? 'EGP';
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function duplicateDate(date: string): BusinessRuleError {
  return new BusinessRuleError(`The employee already has a salary revision on ${date}.`, { code: 'HR_SALARY.DUPLICATE_DATE', params: { date } });
}

function terminatedReadOnly(): BusinessRuleError {
  return new BusinessRuleError('The employee has left — reactivate them before changing the salary.', { code: 'EMPLOYEE.TERMINATED_READ_ONLY' });
}
