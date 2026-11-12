import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { HrOverviewDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { HR_PERMISSIONS as HR } from '../../../shared/auth/hr-permissions';
import { addDays } from '../domain/attendance';

const PAYROLL = [HR.payrollView, HR.payrollManage, HR.payrollApprove, HR.payrollPay];
const LOANS = [HR.loansView, HR.loansManage, HR.loansApprove];

/** HR reports. Money figures only for those allowed to see pay (salaries stay private). */
@Injectable()
export class HrReportsService {
  async overview(db: Kysely<TenantDatabase>, year: number, permissions: readonly string[], today = new Date().toISOString().slice(0, 10)): Promise<HrOverviewDto> {
    const can = (keys: readonly string[]) => keys.some((k) => permissions.includes(k));
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const currency = (await db.selectFrom('tenant_settings').select('currency_code').executeTakeFirst())?.currency_code ?? 'EGP';

    const counts = await db
      .selectFrom('employees')
      .select(['status', (eb) => eb.fn.countAll<string>().as('n')])
      .groupBy('status')
      .execute();
    const n = (status: string) => Number(counts.find((c) => c.status === status)?.n ?? 0);
    const byDepartment = await db
      .selectFrom('employees as e')
      .leftJoin('hr_departments as d', 'd.id', 'e.department_id')
      .select(['d.name', (eb) => eb.fn.countAll<string>().as('n')])
      .where('e.status', '<>', 'terminated')
      .groupBy('d.name')
      .orderBy('n', 'desc')
      .execute();
    const byType = await db
      .selectFrom('employees')
      .select(['employment_type', (eb) => eb.fn.countAll<string>().as('n')])
      .where('status', '<>', 'terminated')
      .groupBy('employment_type')
      .execute();

    const hires = await db
      .selectFrom('employees')
      .select([sql<string>`to_char(hire_date, 'YYYY-MM')`.as('m'), (eb) => eb.fn.countAll<string>().as('n')])
      .where('hire_date', '>=', from)
      .where('hire_date', '<=', to)
      .groupBy(sql`to_char(hire_date, 'YYYY-MM')`)
      .execute();
    const leavers = await db
      .selectFrom('employees')
      .select([sql<string>`to_char(termination_date, 'YYYY-MM')`.as('m'), (eb) => eb.fn.countAll<string>().as('n')])
      .where('termination_date', '>=', from)
      .where('termination_date', '<=', to)
      .groupBy(sql`to_char(termination_date, 'YYYY-MM')`)
      .execute();
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

    let payrollCost: HrOverviewDto['payrollCost'] = null;
    let costByDepartment: HrOverviewDto['costByDepartment'] = null;
    if (can(PAYROLL)) {
      const rows = await db
        .selectFrom('hr_payroll_lines as l')
        .innerJoin('hr_payroll_runs as r', 'r.id', 'l.run_id')
        .select([
          sql<string>`to_char(l.pay_month, 'YYYY-MM')`.as('m'),
          (eb) => eb.fn.countAll<string>().as('employees'),
          sql<string>`sum(l.gross_minor)`.as('gross'),
          sql<string>`sum(l.net_minor)`.as('net'),
          sql<string>`sum(l.loan_minor)`.as('loan'),
          sql<string>`sum(l.expense_minor)`.as('expense'),
        ])
        .where('r.status', '<>', 'draft')
        .where('l.pay_month', '>=', from)
        .where('l.pay_month', '<=', to)
        .groupBy(sql`to_char(l.pay_month, 'YYYY-MM')`)
        .execute();
      payrollCost = months.map((m) => {
        const r = rows.find((x) => x.m === m);
        return {
          month: m,
          employees: Number(r?.employees ?? 0),
          grossMinorUnits: String(r?.gross ?? 0),
          netMinorUnits: String(r?.net ?? 0),
          loanMinorUnits: String(r?.loan ?? 0),
          expenseMinorUnits: String(r?.expense ?? 0),
        };
      });
      costByDepartment = (
        await db
          .selectFrom('hr_payroll_lines as l')
          .innerJoin('hr_payroll_runs as r', 'r.id', 'l.run_id')
          .innerJoin('employees as e', 'e.id', 'l.employee_id')
          .leftJoin('hr_departments as d', 'd.id', 'e.department_id')
          .select(['d.name', sql<string>`sum(l.expense_minor)`.as('expense')])
          .where('r.status', '<>', 'draft')
          .where('l.pay_month', '>=', from)
          .where('l.pay_month', '<=', to)
          .groupBy('d.name')
          .orderBy('expense', 'desc')
          .execute()
      ).map((r) => ({ departmentName: r.name, expenseMinorUnits: String(r.expense) }));
    }

    const expiring = await db
      .selectFrom('employees')
      .select(['id', 'code', 'full_name', 'national_id_expiry'])
      .where('status', '<>', 'terminated')
      .where('national_id_expiry', 'is not', null)
      .where('national_id_expiry', '<=', addDays(today, 60))
      .orderBy('national_id_expiry')
      .execute();

    let openLoans: HrOverviewDto['openLoans'] = null;
    if (can(LOANS)) {
      const r = await db
        .selectFrom('hr_loans as l')
        .select([
          (eb) => eb.fn.countAll<string>().as('n'),
          sql<string>`coalesce(sum((SELECT sum(i.amount_minor - i.paid_minor) FROM hr_loan_installments i WHERE i.loan_id = l.id)), 0)`.as('remaining'),
        ])
        .where('l.status', '=', 'active')
        .executeTakeFirstOrThrow();
      openLoans = { count: Number(r.n), remainingMinorUnits: String(r.remaining) };
    }

    return {
      year,
      currency,
      headcount: {
        active: n('active'),
        suspended: n('suspended'),
        byDepartment: byDepartment.map((d) => ({ departmentName: d.name, count: Number(d.n) })),
        byEmploymentType: byType.map((t) => ({ employmentType: t.employment_type, count: Number(t.n) })),
      },
      movement: months.map((m) => ({
        month: m,
        hires: Number(hires.find((h) => h.m === m)?.n ?? 0),
        leavers: Number(leavers.find((l) => l.m === m)?.n ?? 0),
      })),
      payrollCost,
      costByDepartment,
      expiringIds: expiring.map((e) => ({ employeeId: e.id, code: e.code, fullName: e.full_name, expiry: e.national_id_expiry! })),
      openLoans,
    };
  }
}
