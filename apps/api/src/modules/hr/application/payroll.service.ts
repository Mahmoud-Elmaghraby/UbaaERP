import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type {
  CreatePayrollRunDto,
  PayPayrollDto,
  PayrollLineDto,
  PayrollOverrideFieldDto,
  PayrollRunDto,
  PayrollRunQueryDto,
  PayrollRunStatusDto,
  PayrollRunSummaryDto,
  UpdatePayrollLineDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { withTransaction } from '../../../database/tenant/transaction.util';
import { AppSettingsRepository } from '../../../shared/app-settings/app-settings.repository';
import { BusinessRuleError } from '../../../shared/errors/domain-errors';
import { entityNotFound } from '../../../shared/errors/entity-errors';
import { OutboxWriterService } from '../../../shared/outbox/application/services/outbox-writer.service';
import { TreasuryMovementRegistry } from '../../../shared/treasury/treasury-movements';
import { findTreasury } from '../../../shared/treasury/treasury-reader';
import { NumberingSequencesService } from '../../settings/application/services/numbering-sequences.service';
import { addDays, datesBetween, scheduledMinutes } from '../domain/attendance';
import { countLeaveDays } from '../domain/leave';
import { addMonths, allocatePayment, monthStart } from '../domain/loan';
import { computePayroll, type DayRateBasis, type PayrollRules } from '../domain/payroll';
import { computeSalary, type SalaryComponentCalculation, type SalaryComponentKind } from '../domain/salary';
import { closeIfRepaid } from './loans.service';
import { loadHolidays, loadShiftRules } from './shift-rules';

export const HR_PAYROLL_POSTED = 'hr.payroll.posted';
export const HR_PAYROLL_PAID = 'hr.payroll.paid';

/** Outbox metadata of the posting (one entry per run). */
export interface HrPayrollPostedMetadata {
  number: string;
  month: string;
  /** The month's last day — the entry date. */
  date: string;
  currency: string;
  expenseMinorUnits: string;
  loanMinorUnits: string;
  netMinorUnits: string;
}

/** Outbox metadata of a salary payment from a treasury. */
export interface HrPayrollPaidMetadata {
  number: string;
  runNumber: string;
  date: string;
  treasuryId: string;
  amount: { amountMinorUnits: string; currency: string };
}

const AMOUNTS = [
  ['basic', 'basic_minor'],
  ['allowances', 'allowances_minor'],
  ['overtime', 'overtime_minor'],
  ['bonuses', 'bonuses_minor'],
  ['gross', 'gross_minor'],
  ['componentDeductions', 'component_deductions_minor'],
  ['absence', 'absence_minor'],
  ['late', 'late_minor'],
  ['unpaidLeave', 'unpaid_leave_minor'],
  ['penalties', 'penalties_minor'],
  ['loan', 'loan_minor'],
  ['net', 'net_minor'],
  ['expense', 'expense_minor'],
] as const;

const OVERRIDE_COLUMN: Record<PayrollOverrideFieldDto, 'absence_minor' | 'late_minor' | 'overtime_minor'> = {
  absence: 'absence_minor',
  late: 'late_minor',
  overtime: 'overtime_minor',
};

type Ctx = { schema: string; userId: string | null };

/**
 * The monthly payroll run (مسير الرواتب). Each line is computed from the employee's records —
 * salary in force, attendance (absence, lateness past the monthly allowance, overtime), unpaid
 * leave, bonuses/penalties of the month, loan installments due — by the pure computePayroll().
 * Absence, lateness and overtime are suggestions HR may replace before posting. Posting settles
 * the month (adjustments, installments, salary history locked) and books it through the outbox;
 * paying moves a treasury (CLAUDE.md §2.6/§2.7 — Accounting is never called).
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly numbering: NumberingSequencesService,
    private readonly settings: AppSettingsRepository,
    private readonly outbox: OutboxWriterService,
    private readonly treasuryMovements: TreasuryMovementRegistry,
  ) {}

  async list(db: Kysely<TenantDatabase>, query: PayrollRunQueryDto = {}): Promise<PayrollRunSummaryDto[]> {
    let q = this.summaryQuery(db);
    if (query.year) q = q.where('r.pay_month', '>=', `${query.year}-01-01`).where('r.pay_month', '<=', `${query.year}-12-01`);
    if (query.status) q = q.where('r.status', '=', query.status);
    return (await q.orderBy('r.pay_month', 'desc').orderBy('r.number', 'desc').execute()).map(toSummary);
  }

  async get(db: Kysely<TenantDatabase>, id: string): Promise<PayrollRunDto> {
    const run = await this.summaryQuery(db)
      .leftJoin('users as pu', 'pu.id', 'r.posted_by')
      .select(['r.branch_id', 'r.department_id', 'r.notes', 'r.posted_at', 'r.skipped_employees', 'pu.full_name as posted_by_name'])
      .where('r.id', '=', id)
      .executeTakeFirst();
    if (!run) throw entityNotFound('HR_PAYROLL_RUN', id);
    const lines = await db
      .selectFrom('hr_payroll_lines as l')
      .innerJoin('employees as e', 'e.id', 'l.employee_id')
      .leftJoin('hr_departments as d', 'd.id', 'e.department_id')
      .leftJoin('hr_payroll_payments as p', 'p.id', 'l.payment_id')
      .selectAll('l')
      .select(['e.code', 'e.full_name', 'e.payment_method', 'e.bank_name', 'e.bank_account', 'd.name as department_name', 'p.paid_on'])
      .where('l.run_id', '=', id)
      .orderBy('e.code')
      .execute();
    const payments = await db
      .selectFrom('hr_payroll_payments as p')
      .innerJoin('treasuries as t', 't.id', 'p.treasury_id')
      .select(['p.id', 'p.number', 'p.paid_on', 't.name as treasury_name', 'p.amount_minor', 'p.line_count'])
      .where('p.run_id', '=', id)
      .orderBy('p.created_at')
      .execute();
    const totals: Record<string, string> = {};
    for (const [key, column] of AMOUNTS) totals[key] = lines.reduce((s, l) => s + BigInt(l[column]), 0n).toString();
    totals.manualAdjustment = lines.reduce((s, l) => s + BigInt(l.manual_adjustment_minor), 0n).toString();
    return {
      ...toSummary(run),
      branchId: run.branch_id,
      departmentId: run.department_id,
      notes: run.notes,
      postedByName: run.posted_by_name,
      postedAt: run.posted_at ? new Date(run.posted_at).toISOString() : null,
      totals,
      lines: lines.map((l): PayrollLineDto => ({
        id: l.id,
        employeeId: l.employee_id,
        employeeCode: l.code,
        employeeName: l.full_name,
        departmentName: l.department_name,
        paymentMethod: l.payment_method as PayrollLineDto['paymentMethod'],
        bankName: l.bank_name,
        bankAccount: l.bank_account,
        basicMinorUnits: l.basic_minor,
        allowancesMinorUnits: l.allowances_minor,
        overtimeMinorUnits: l.overtime_minor,
        bonusesMinorUnits: l.bonuses_minor,
        grossMinorUnits: l.gross_minor,
        componentDeductionsMinorUnits: l.component_deductions_minor,
        absenceMinorUnits: l.absence_minor,
        lateMinorUnits: l.late_minor,
        unpaidLeaveMinorUnits: l.unpaid_leave_minor,
        penaltiesMinorUnits: l.penalties_minor,
        loanMinorUnits: l.loan_minor,
        manualAdjustmentMinorUnits: l.manual_adjustment_minor,
        manualAdjustmentNote: l.manual_adjustment_note,
        netMinorUnits: l.net_minor,
        overridden: l.overridden as PayrollOverrideFieldDto[],
        details: (l.details ?? {}) as Record<string, unknown>,
        warnings: l.warnings,
        paid: l.payment_id !== null,
        paidOn: l.paid_on ?? null,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        number: p.number,
        date: p.paid_on,
        treasuryName: p.treasury_name,
        amountMinorUnits: p.amount_minor,
        lineCount: p.line_count,
      })),
      skippedEmployees: run.skipped_employees,
    };
  }

  /** A draft run for every eligible employee not already in another run of the month. */
  async create(db: Kysely<TenantDatabase>, input: CreatePayrollRunDto, userId: string | null): Promise<PayrollRunDto> {
    const month = monthStart(input.month);
    const monthEnd = addDays(addMonths(month, 1), -1);
    let q = db
      .selectFrom('employees')
      .select(['id', 'full_name'])
      .where('hire_date', '<=', monthEnd)
      .where((eb) => eb.or([eb('termination_date', 'is', null), eb('termination_date', '>=', month)]))
      .where('status', '<>', 'suspended');
    if (input.branchId) q = q.where('branch_id', '=', input.branchId);
    if (input.departmentId) q = q.where('department_id', '=', input.departmentId);
    const candidates = await q.orderBy('code').execute();
    const taken = new Set(
      (await db.selectFrom('hr_payroll_lines').select('employee_id').where('pay_month', '=', month).execute()).map((r) => r.employee_id),
    );
    const employees = candidates.filter((e) => !taken.has(e.id));
    if (employees.length === 0) {
      throw new BusinessRuleError('Nobody is left to pay for this month.', { code: 'HR_PAYROLL.NO_EMPLOYEES' });
    }
    const id = randomUUID();
    await withTransaction(db, async (trx) => {
      const { formatted } = await this.numbering.allocateNext(trx, 'payroll_run');
      await trx
        .insertInto('hr_payroll_runs')
        .values({
          id,
          number: formatted,
          pay_month: month,
          branch_id: input.branchId ?? null,
          department_id: input.departmentId ?? null,
          currency: await companyCurrency(trx),
          notes: input.notes?.trim() || null,
          skipped_employees: candidates.filter((e) => taken.has(e.id)).map((e) => e.full_name),
          created_by: userId,
        })
        .execute();
      await trx
        .insertInto('hr_payroll_lines')
        .values(employees.map((e) => ({ id: randomUUID(), run_id: id, employee_id: e.id, pay_month: month })))
        .execute();
      await this.calculate(trx, id);
    });
    return this.get(db, id);
  }

  /** Recomputes a draft from the current records; replaced amounts and hand adjustments stay. */
  async recalculate(db: Kysely<TenantDatabase>, id: string): Promise<PayrollRunDto> {
    await this.requireRun(db, id, 'draft');
    await withTransaction(db, (trx) => this.calculate(trx, id));
    return this.get(db, id);
  }

  async updateLine(db: Kysely<TenantDatabase>, runId: string, lineId: string, input: UpdatePayrollLineDto): Promise<PayrollRunDto> {
    await this.requireRun(db, runId, 'draft');
    const line = await db.selectFrom('hr_payroll_lines').selectAll().where('id', '=', lineId).where('run_id', '=', runId).executeTakeFirst();
    if (!line) throw entityNotFound('HR_PAYROLL_LINE', lineId);
    const overridden = new Set(line.overridden as PayrollOverrideFieldDto[]);
    const set: Record<string, unknown> = {};
    for (const [field, value] of [
      ['absence', input.absenceMinorUnits],
      ['late', input.lateMinorUnits],
      ['overtime', input.overtimeMinorUnits],
    ] as const) {
      if (value === undefined) continue;
      if (value === null) overridden.delete(field);
      else {
        overridden.add(field);
        set[OVERRIDE_COLUMN[field]] = value;
      }
    }
    if (input.manualAdjustmentMinorUnits !== undefined) set.manual_adjustment_minor = input.manualAdjustmentMinorUnits;
    if (input.manualAdjustmentNote !== undefined) set.manual_adjustment_note = input.manualAdjustmentNote?.trim() || null;
    await withTransaction(db, async (trx) => {
      await trx
        .updateTable('hr_payroll_lines')
        .set({ ...set, overridden: [...overridden] })
        .where('id', '=', lineId)
        .execute();
      await this.calculate(trx, runId, [line.employee_id]);
    });
    return this.get(db, runId);
  }

  /** Takes an employee out of a draft run (they can go in another run of the month). */
  async removeLine(db: Kysely<TenantDatabase>, runId: string, lineId: string): Promise<PayrollRunDto> {
    await this.requireRun(db, runId, 'draft');
    const deleted = await db.deleteFrom('hr_payroll_lines').where('id', '=', lineId).where('run_id', '=', runId).executeTakeFirst();
    if (!deleted.numDeletedRows) throw entityNotFound('HR_PAYROLL_LINE', lineId);
    return this.get(db, runId);
  }

  async deleteDraft(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await this.requireRun(db, id, 'draft');
    await db.deleteFrom('hr_payroll_runs').where('id', '=', id).execute();
  }

  /**
   * Approves the run as it stands: settles the month's bonuses/penalties and pays the loan
   * installments from the deductions, then books it (one entry) through the outbox.
   */
  async post(db: Kysely<TenantDatabase>, id: string, ctx: Ctx): Promise<PayrollRunDto> {
    const run = await this.requireRun(db, id, 'draft');
    await withTransaction(db, async (trx) => {
      const lines = await trx.selectFrom('hr_payroll_lines').selectAll().where('run_id', '=', id).execute();
      if (lines.length === 0) throw new BusinessRuleError('The run has no employees.', { code: 'HR_PAYROLL.NO_EMPLOYEES' });
      for (const line of lines) {
        const details = (line.details ?? {}) as { adjustmentIds?: string[] };
        if (details.adjustmentIds?.length) {
          await trx
            .updateTable('hr_pay_adjustments')
            .set({ payroll_run_id: id })
            .where('id', 'in', details.adjustmentIds)
            .where('payroll_run_id', 'is', null)
            .execute();
        }
        await settleInstallments(trx, line.employee_id, run.pay_month, BigInt(line.loan_minor));
      }
      const updated = await trx
        .updateTable('hr_payroll_runs')
        .set({ status: 'posted', posted_by: ctx.userId, posted_at: new Date() })
        .where('id', '=', id)
        .where('status', '=', 'draft')
        .executeTakeFirst();
      if (!updated.numUpdatedRows) throw wrongStatus();
      const sum = (column: 'expense_minor' | 'loan_minor' | 'net_minor') => lines.reduce((s, l) => s + BigInt(l[column]), 0n).toString();
      const metadata: HrPayrollPostedMetadata = {
        number: run.number,
        month: run.pay_month.slice(0, 7),
        date: addDays(addMonths(run.pay_month, 1), -1),
        currency: run.currency,
        expenseMinorUnits: sum('expense_minor'),
        loanMinorUnits: sum('loan_minor'),
        netMinorUnits: sum('net_minor'),
      };
      await this.outbox.write(trx, HR_PAYROLL_POSTED, {
        schema: ctx.schema,
        entityType: 'payroll',
        entityId: id,
        action: 'posted',
        actorUserId: ctx.userId,
        occurredAt: new Date(),
        metadata: metadata as unknown as Record<string, unknown>,
      });
    });
    return this.get(db, id);
  }

  /** Pays the unpaid lines (all, or the ones given) from one treasury. */
  async pay(db: Kysely<TenantDatabase>, id: string, input: PayPayrollDto, ctx: Ctx): Promise<PayrollRunDto> {
    const run = await this.requireRun(db, id, 'posted');
    const treasury = await findTreasury(db, input.treasuryId);
    if (!treasury) throw entityNotFound('TREASURY', input.treasuryId);
    if (!treasury.isActive) throw new BusinessRuleError(`Treasury "${treasury.name}" is inactive.`, { code: 'TREASURY.INACTIVE', params: { name: treasury.name } });
    if (treasury.currency !== run.currency) {
      throw new BusinessRuleError(`Treasury "${treasury.name}" is in ${treasury.currency}.`, {
        code: 'HR_LOAN.TREASURY_CURRENCY',
        params: { name: treasury.name, currency: run.currency },
      });
    }
    if (input.date < run.pay_month) {
      throw new BusinessRuleError('Salaries are paid on or after the start of their month.', { code: 'HR_PAYROLL.PAY_BEFORE_MONTH' });
    }
    await withTransaction(db, async (trx) => {
      let q = trx.selectFrom('hr_payroll_lines').select(['id', 'net_minor']).where('run_id', '=', id).where('payment_id', 'is', null).forUpdate();
      if (input.lineIds) {
        if (input.lineIds.length === 0) throw new BusinessRuleError('Nothing left to pay.', { code: 'HR_PAYROLL.NOTHING_TO_PAY' });
        q = q.where('id', 'in', input.lineIds);
      }
      const lines = await q.execute();
      if (lines.length === 0) throw new BusinessRuleError('Nothing left to pay.', { code: 'HR_PAYROLL.NOTHING_TO_PAY' });
      const amount = lines.reduce((s, l) => s + BigInt(l.net_minor), 0n);
      await this.treasuryMovements.assertCanWithdraw(trx, treasury.id, amount);
      const paymentId = randomUUID();
      const { formatted } = await this.numbering.allocateNext(trx, 'payroll_payment');
      await trx
        .insertInto('hr_payroll_payments')
        .values({
          id: paymentId,
          number: formatted,
          run_id: id,
          treasury_id: treasury.id,
          paid_on: input.date,
          amount_minor: amount.toString(),
          currency: run.currency,
          line_count: lines.length,
          created_by: ctx.userId,
        })
        .execute();
      await trx.updateTable('hr_payroll_lines').set({ payment_id: paymentId }).where('id', 'in', lines.map((l) => l.id)).execute();
      const unpaid = await trx.selectFrom('hr_payroll_lines').select('id').where('run_id', '=', id).where('payment_id', 'is', null).executeTakeFirst();
      if (!unpaid) await trx.updateTable('hr_payroll_runs').set({ status: 'paid' }).where('id', '=', id).execute();
      if (amount > 0n) {
        const metadata: HrPayrollPaidMetadata = {
          number: formatted,
          runNumber: run.number,
          date: input.date,
          treasuryId: treasury.id,
          amount: { amountMinorUnits: amount.toString(), currency: run.currency },
        };
        await this.outbox.write(trx, HR_PAYROLL_PAID, {
          schema: ctx.schema,
          entityType: 'payroll_payment',
          entityId: paymentId,
          action: 'paid',
          actorUserId: ctx.userId,
          occurredAt: new Date(),
          metadata: metadata as unknown as Record<string, unknown>,
        });
      }
    });
    return this.get(db, id);
  }

  // ── the calculation ───────────────────────────────────────────────────────

  private async calculate(db: Kysely<TenantDatabase>, runId: string, onlyEmployees?: string[]): Promise<void> {
    const run = await db.selectFrom('hr_payroll_runs').selectAll().where('id', '=', runId).executeTakeFirstOrThrow();
    const month = run.pay_month;
    const monthEnd = addDays(addMonths(month, 1), -1);
    const monthDays = datesBetween(month, monthEnd);
    let linesQ = db.selectFrom('hr_payroll_lines').selectAll().where('run_id', '=', runId);
    if (onlyEmployees) linesQ = linesQ.where('employee_id', 'in', onlyEmployees);
    const lines = await linesQ.execute();
    if (lines.length === 0) return;
    const ids = lines.map((l) => l.employee_id);

    const rules: PayrollRules = {
      dayRateBasis: (await this.settings.get(db, 'hr.dayRateBasis')) as DayRateBasis,
      absenceDeductionDays: await this.settings.get(db, 'hr.absenceDeductionDays'),
      monthlyLateAllowanceMinutes: await this.settings.get(db, 'hr.monthlyLateAllowanceMinutes'),
      overtimeMultiplier: await this.settings.get(db, 'hr.overtimeMultiplier'),
    };
    const employees = new Map(
      (await db.selectFrom('employees').select(['id', 'hire_date', 'termination_date', 'shift_id']).where('id', 'in', ids).execute()).map((e) => [e.id, e]),
    );
    const shifts = await loadShiftRules(db);
    const holidays = await loadHolidays(db, month, monthEnd);

    // Salary in force on each employee's last day of the month, with its components.
    const salaries = await db
      .selectFrom('hr_employee_salaries as s')
      .innerJoin('employees as e', 'e.id', 's.employee_id')
      .select(['s.id', 's.employee_id', 's.basic_minor', 's.effective_from'])
      .where('s.employee_id', 'in', ids)
      .where(sql<boolean>`s.effective_from <= least(${monthEnd}::date, coalesce(e.termination_date, ${monthEnd}::date))`)
      .orderBy('s.effective_from', 'desc')
      .execute();
    const salaryOf = new Map<string, (typeof salaries)[number]>();
    for (const s of salaries) if (!salaryOf.has(s.employee_id)) salaryOf.set(s.employee_id, s);
    const salaryIds = [...salaryOf.values()].map((s) => s.id);
    const componentLines = salaryIds.length
      ? await db
          .selectFrom('hr_employee_salary_lines as l')
          .innerJoin('hr_salary_components as c', 'c.id', 'l.component_id')
          .select(['l.salary_id', 'l.component_id', 'c.name', 'c.kind', 'c.calculation', 'l.amount_minor', 'l.percent'])
          .where('l.salary_id', 'in', salaryIds)
          .execute()
      : [];

    const attendance = new Map(
      (
        await db
          .selectFrom('hr_attendance_days')
          .select([
            'employee_id',
            sql<string>`count(*) FILTER (WHERE status = 'absent')`.as('absent'),
            sql<string>`coalesce(sum(late_minutes + early_leave_minutes), 0)`.as('late'),
            sql<string>`coalesce(sum(overtime_minutes), 0)`.as('overtime'),
            sql<string>`count(*)`.as('days'),
          ])
          .where('employee_id', 'in', ids)
          .where('work_date', '>=', month)
          .where('work_date', '<=', monthEnd)
          .groupBy('employee_id')
          .execute()
      ).map((a) => [a.employee_id, a]),
    );
    const leaves = await db
      .selectFrom('hr_leave_requests as r')
      .innerJoin('hr_leave_types as t', 't.id', 'r.leave_type_id')
      .select(['r.employee_id', 'r.start_date', 'r.end_date', 'r.half_day', 't.pay_percent', 't.name'])
      .where('r.status', '=', 'approved')
      .where('t.pay_percent', '<', 100)
      .where('r.employee_id', 'in', ids)
      .where('r.start_date', '<=', monthEnd)
      .where('r.end_date', '>=', month)
      .execute();
    const adjustments = await db
      .selectFrom('hr_pay_adjustments')
      .select(['id', 'employee_id', 'kind', 'amount_minor', 'days', 'reason'])
      .where('employee_id', 'in', ids)
      .where('pay_month', '=', month)
      .where((eb) => eb.or([eb('payroll_run_id', 'is', null), eb('payroll_run_id', '=', runId)]))
      .execute();
    const loanDue = new Map(
      (
        await db
          .selectFrom('hr_loan_installments as i')
          .innerJoin('hr_loans as l', 'l.id', 'i.loan_id')
          .select(['l.employee_id', sql<string>`sum(i.amount_minor - i.paid_minor)`.as('due')])
          .where('l.status', '=', 'active')
          .where('l.employee_id', 'in', ids)
          .where('i.due_month', '<=', month)
          .whereRef('i.paid_minor', '<', 'i.amount_minor')
          .groupBy('l.employee_id')
          .execute()
      ).map((r) => [r.employee_id, BigInt(r.due)]),
    );

    const currency = run.currency;
    const money = (minor: string | bigint | null | undefined) => Money.fromMinorUnits(BigInt(minor ?? 0), currency);
    for (const line of lines) {
      const e = employees.get(line.employee_id)!;
      const rule = shifts.of(e.shift_id);
      const from = e.hire_date > month ? e.hire_date : month;
      const to = e.termination_date && e.termination_date < monthEnd ? e.termination_date : monthEnd;
      const employedDays = datesBetween(from, to).length;
      const salary = salaryOf.get(line.employee_id);
      const warnings: string[] = [];
      if (!salary) warnings.push('NO_SALARY');

      const comps = componentLines.filter((c) => c.salary_id === salary?.id);
      const breakdown = computeSalary(
        money(salary?.basic_minor),
        comps.map((c) => ({
          componentId: c.component_id,
          kind: c.kind as SalaryComponentKind,
          calculation: c.calculation as SalaryComponentCalculation,
          amount: c.amount_minor === null ? null : money(c.amount_minor),
          percent: c.percent === null ? null : Number(c.percent),
        })),
      );
      const att = attendance.get(line.employee_id);
      if (!att) warnings.push('NO_ATTENDANCE');
      let unpaidLeaveDays = 0;
      const leaveDetails: { type: string; days: number; payPercent: number }[] = [];
      for (const l of leaves.filter((x) => x.employee_id === line.employee_id)) {
        const start = l.start_date > from ? l.start_date : from;
        const end = l.end_date < to ? l.end_date : to;
        if (start > end) continue;
        const days = countLeaveDays(start, end, l.half_day, rule, holidays);
        unpaidLeaveDays += (days * (100 - l.pay_percent)) / 100;
        leaveDetails.push({ type: l.name, days, payPercent: l.pay_percent });
      }
      const mine = adjustments.filter((a) => a.employee_id === line.employee_id);
      const item = (a: (typeof mine)[number]) => ({ amount: a.amount_minor === null ? null : money(a.amount_minor), days: a.days === null ? null : Number(a.days) });
      const overridden = new Set(line.overridden as PayrollOverrideFieldDto[]);

      const result = computePayroll(
        {
          currency,
          basic: money(salary?.basic_minor),
          allowances: breakdown.earnings,
          componentDeductions: breakdown.deductions,
          proration: employedDays / monthDays.length,
          workingDaysInMonth: monthDays.filter((d) => !rule.weeklyOffDays.includes(new Date(`${d}T00:00:00Z`).getUTCDay())).length,
          scheduledMinutesPerDay: scheduledMinutes(rule),
          absentDays: Number(att?.absent ?? 0),
          lateMinutes: Number(att?.late ?? 0),
          overtimeMinutes: Number(att?.overtime ?? 0),
          unpaidLeaveDays,
          bonuses: mine.filter((a) => a.kind === 'bonus').map(item),
          penalties: mine.filter((a) => a.kind === 'penalty').map(item),
          loanDue: money(loanDue.get(line.employee_id) ?? 0n),
          overrides: {
            absence: overridden.has('absence') ? money(line.absence_minor) : undefined,
            late: overridden.has('late') ? money(line.late_minor) : undefined,
            overtime: overridden.has('overtime') ? money(line.overtime_minor) : undefined,
          },
          manualAdjustment: money(line.manual_adjustment_minor),
        },
        rules,
      );
      const minor = (m: Money) => m.toMinorUnits().toString();
      await db
        .updateTable('hr_payroll_lines')
        .set({
          basic_minor: minor(result.basic),
          allowances_minor: minor(result.allowances),
          overtime_minor: minor(result.overtime),
          bonuses_minor: minor(result.bonuses),
          gross_minor: minor(result.gross),
          component_deductions_minor: minor(result.componentDeductions),
          absence_minor: minor(result.absence),
          late_minor: minor(result.late),
          unpaid_leave_minor: minor(result.unpaidLeave),
          penalties_minor: minor(result.penalties),
          loan_minor: minor(result.loan),
          net_minor: minor(result.net),
          expense_minor: minor(result.expense),
          warnings: [...warnings, ...result.warnings],
          details: JSON.stringify({
            salaryFrom: salary?.effective_from ?? null,
            employedDays,
            monthDays: monthDays.length,
            effectiveManualAdjustmentMinorUnits: minor(result.manualAdjustment),
            dayRateMinorUnits: minor(result.dayRate),
            hourRateMinorUnits: minor(result.hourRate),
            absentDays: Number(att?.absent ?? 0),
            lateMinutes: Number(att?.late ?? 0),
            chargeableLateMinutes: result.chargeableLateMinutes,
            overtimeMinutes: Number(att?.overtime ?? 0),
            attendanceDays: Number(att?.days ?? 0),
            components: breakdown.lines.map((l, i) => ({
              name: comps[i]!.name,
              kind: l.kind,
              percent: l.percent,
              valueMinorUnits: minor(l.value),
            })),
            leaves: leaveDetails,
            adjustments: mine.map((a) => ({ kind: a.kind, reason: a.reason, amountMinorUnits: a.amount_minor, days: a.days === null ? null : Number(a.days) })),
            adjustmentIds: mine.map((a) => a.id),
            rules,
          }),
        })
        .where('id', '=', line.id)
        .execute();
    }
  }

  private async requireRun(db: Kysely<TenantDatabase>, id: string, status: PayrollRunStatusDto) {
    const run = await db.selectFrom('hr_payroll_runs').selectAll().where('id', '=', id).executeTakeFirst();
    if (!run) throw entityNotFound('HR_PAYROLL_RUN', id);
    if (run.status !== status) throw wrongStatus();
    return run;
  }

  private summaryQuery(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('hr_payroll_runs as r')
      .leftJoin('branches as b', 'b.id', 'r.branch_id')
      .leftJoin('hr_departments as d', 'd.id', 'r.department_id')
      .select([
        'r.id',
        'r.number',
        'r.pay_month',
        'r.status',
        'r.currency',
        'r.created_at',
        'b.name as branch_name',
        'd.name as department_name',
        sql<string>`(SELECT count(*) FROM hr_payroll_lines l WHERE l.run_id = r.id)`.as('employee_count'),
        sql<string>`(SELECT coalesce(sum(l.gross_minor), 0) FROM hr_payroll_lines l WHERE l.run_id = r.id)`.as('gross'),
        sql<string>`(SELECT coalesce(sum(l.net_minor), 0) FROM hr_payroll_lines l WHERE l.run_id = r.id)`.as('net'),
        sql<string>`(SELECT coalesce(sum(p.amount_minor), 0) FROM hr_payroll_payments p WHERE p.run_id = r.id)`.as('paid'),
      ]);
  }
}

/** Pays an employee's open installments due up to the month, oldest first, from a payroll deduction. */
async function settleInstallments(trx: Kysely<TenantDatabase>, employeeId: string, month: string, amount: bigint): Promise<void> {
  if (amount <= 0n) return;
  const installments = await trx
    .selectFrom('hr_loan_installments as i')
    .innerJoin('hr_loans as l', 'l.id', 'i.loan_id')
    .select(['i.id', 'i.loan_id', 'i.amount_minor', 'i.paid_minor'])
    .where('l.employee_id', '=', employeeId)
    .where('l.status', '=', 'active')
    .where('i.due_month', '<=', month)
    .whereRef('i.paid_minor', '<', 'i.amount_minor')
    .orderBy('i.due_month')
    .orderBy('i.sequence')
    .forUpdate()
    .execute();
  const allocation = allocatePayment(
    installments.map((i) => ({ id: i.id, amount: BigInt(i.amount_minor), paid: BigInt(i.paid_minor) })),
    amount,
  );
  for (const a of allocation) {
    await trx
      .updateTable('hr_loan_installments')
      .set((eb) => ({ paid_minor: sql`${eb.ref('paid_minor')} + ${a.add.toString()}::bigint` }))
      .where('id', '=', a.id)
      .execute();
  }
  for (const loanId of new Set(installments.map((i) => i.loan_id))) await closeIfRepaid(trx, loanId);
}

function wrongStatus(): BusinessRuleError {
  return new BusinessRuleError('The payroll run is not in a state that allows this.', { code: 'HR_PAYROLL.WRONG_STATUS' });
}

async function companyCurrency(db: Kysely<TenantDatabase>): Promise<string> {
  const row = await db.selectFrom('tenant_settings').select('currency_code').executeTakeFirst();
  return row?.currency_code ?? 'EGP';
}

function toSummary(r: {
  id: string;
  number: string;
  pay_month: string;
  status: string;
  currency: string;
  created_at: Date;
  branch_name: string | null;
  department_name: string | null;
  employee_count: string;
  gross: string;
  net: string;
  paid: string;
}): PayrollRunSummaryDto {
  return {
    id: r.id,
    number: r.number,
    month: r.pay_month.slice(0, 7),
    branchName: r.branch_name,
    departmentName: r.department_name,
    status: r.status as PayrollRunStatusDto,
    currency: r.currency,
    employeeCount: Number(r.employee_count),
    grossMinorUnits: String(r.gross),
    netMinorUnits: String(r.net),
    paidMinorUnits: String(r.paid),
    createdAt: new Date(r.created_at).toISOString(),
  };
}
