import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type {
  CreateLoanDto,
  CreatePayAdjustmentsDto,
  DisburseLoanDto,
  LoanDecisionDto,
  LoanDto,
  LoanQueryDto,
  LoanStatusDto,
  LoanSummaryDto,
  PayAdjustmentDto,
  PayAdjustmentKindDto,
  PayAdjustmentQueryDto,
  PostponeLoanDto,
  RepayLoanDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { withTransaction } from '../../../database/tenant/transaction.util';
import { BusinessRuleError } from '../../../shared/errors/domain-errors';
import { entityNotFound } from '../../../shared/errors/entity-errors';
import { OutboxWriterService } from '../../../shared/outbox/application/services/outbox-writer.service';
import { TreasuryMovementRegistry } from '../../../shared/treasury/treasury-movements';
import { findTreasury } from '../../../shared/treasury/treasury-reader';
import { NumberingSequencesService } from '../../settings/application/services/numbering-sequences.service';
import { addMonths, allocatePayment, buildSchedule, monthStart } from '../domain/loan';

export const HR_LOAN_DISBURSED = 'hr.loan.disbursed';
export const HR_LOAN_REPAID = 'hr.loan.repaid';

/** Outbox metadata of both loan money events (Accounting books them; Treasury lists them). */
export interface HrLoanMoneyEventMetadata {
  number: string;
  loanNumber: string;
  date: string;
  treasuryId: string;
  employeeName: string;
  amount: { amountMinorUnits: string; currency: string };
}

type Context = { schema: string; userId: string | null };

/**
 * Employee loans and advances (السلف) and one-off bonuses/penalties (المكافآت والجزاءات).
 * A loan is the company's money with the employee: paying it out and taking cash back move a
 * treasury in the same transaction as an outbox event (CLAUDE.md §2.7) that Accounting books
 * against the employee-advances account. Installments are deducted by the payroll run (step 6).
 */
@Injectable()
export class LoansService {
  constructor(
    private readonly numbering: NumberingSequencesService,
    private readonly outbox: OutboxWriterService,
    private readonly treasuryMovements: TreasuryMovementRegistry,
  ) {}

  async list(db: Kysely<TenantDatabase>, query: LoanQueryDto = {}): Promise<LoanSummaryDto[]> {
    let q = this.summaryQuery(db);
    if (query.status) q = q.where('l.status', '=', query.status);
    if (query.employeeId) q = q.where('l.employee_id', '=', query.employeeId);
    if (query.open === 'true') q = q.where('l.status', 'in', ['pending', 'approved', 'active']);
    const rows = await q.orderBy('l.created_at', 'desc').limit(5000).execute();
    return rows.map(toSummary);
  }

  async get(db: Kysely<TenantDatabase>, id: string): Promise<LoanDto> {
    const row = await this.summaryQuery(db)
      .leftJoin('treasuries as t', 't.id', 'l.treasury_id')
      .leftJoin('users as u', 'u.id', 'l.decided_by')
      .select(['l.reason', 'l.treasury_id', 't.name as treasury_name', 'u.full_name as decided_by_name', 'l.decision_note'])
      .where('l.id', '=', id)
      .executeTakeFirst();
    if (!row) throw entityNotFound('HR_LOAN', id);
    const installments = await db.selectFrom('hr_loan_installments').selectAll().where('loan_id', '=', id).orderBy('sequence').execute();
    const repayments = await db
      .selectFrom('hr_loan_repayments as r')
      .innerJoin('treasuries as t', 't.id', 'r.treasury_id')
      .select(['r.id', 'r.number', 'r.repaid_on', 't.name as treasury_name', 'r.amount_minor'])
      .where('r.loan_id', '=', id)
      .orderBy('r.repaid_on')
      .orderBy('r.created_at')
      .execute();
    return {
      ...toSummary(row),
      reason: row.reason,
      treasuryId: row.treasury_id,
      treasuryName: row.treasury_name,
      decidedByName: row.decided_by_name,
      decisionNote: row.decision_note,
      installments: installments.map((i) => {
        const amount = BigInt(i.amount_minor);
        const paid = BigInt(i.paid_minor);
        return {
          id: i.id,
          sequence: i.sequence,
          month: i.due_month.slice(0, 7),
          amountMinorUnits: i.amount_minor,
          paidMinorUnits: i.paid_minor,
          status: paid >= amount ? ('paid' as const) : paid > 0n ? ('partly_paid' as const) : ('due' as const),
        };
      }),
      repayments: repayments.map((r) => ({
        id: r.id,
        number: r.number,
        date: r.repaid_on,
        treasuryName: r.treasury_name,
        amountMinorUnits: r.amount_minor,
      })),
    };
  }

  async create(db: Kysely<TenantDatabase>, input: CreateLoanDto, userId: string | null): Promise<LoanDto> {
    const employee = await db.selectFrom('employees').select(['id', 'status']).where('id', '=', input.employeeId).executeTakeFirst();
    if (!employee) throw entityNotFound('EMPLOYEE', input.employeeId);
    if (employee.status === 'terminated') throw new BusinessRuleError('The employee has left.', { code: 'EMPLOYEE.TERMINATED_READ_ONLY' });
    const amount = BigInt(input.amountMinorUnits);
    const schedule = buildSchedule(
      amount,
      input.installmentCount !== undefined ? { count: input.installmentCount } : { perInstallment: BigInt(input.installmentMinorUnits!) },
      input.firstMonth,
    );
    const currency = await companyCurrency(db);
    const id = randomUUID();
    await withTransaction(db, async (trx) => {
      const { formatted } = await this.numbering.allocateNext(trx, 'employee_loan');
      await trx
        .insertInto('hr_loans')
        .values({
          id,
          number: formatted,
          employee_id: input.employeeId,
          amount_minor: amount.toString(),
          currency,
          first_month: monthStart(input.firstMonth),
          reason: input.reason?.trim() || null,
          created_by: userId,
        })
        .execute();
      await trx
        .insertInto('hr_loan_installments')
        .values(schedule.map((s, i) => ({ id: randomUUID(), loan_id: id, sequence: i + 1, due_month: s.month, amount_minor: s.amount.toString() })))
        .execute();
    });
    return this.get(db, id);
  }

  async approve(db: Kysely<TenantDatabase>, id: string, input: LoanDecisionDto, userId: string): Promise<LoanDto> {
    const loan = await this.requireStatus(db, id, ['pending']);
    await assertNotOwn(db, loan.employee_id, userId);
    await this.decide(db, id, 'approved', input, userId);
    return this.get(db, id);
  }

  async reject(db: Kysely<TenantDatabase>, id: string, input: LoanDecisionDto, userId: string): Promise<LoanDto> {
    const loan = await this.requireStatus(db, id, ['pending']);
    await assertNotOwn(db, loan.employee_id, userId);
    await this.decide(db, id, 'rejected', input, userId);
    return this.get(db, id);
  }

  /** Only before any money moved. */
  async cancel(db: Kysely<TenantDatabase>, id: string, input: LoanDecisionDto, userId: string | null): Promise<LoanDto> {
    await this.requireStatus(db, id, ['pending', 'approved']);
    await this.decide(db, id, 'cancelled', input, userId);
    return this.get(db, id);
  }

  /** Pays the approved loan out of a treasury (a cash box can't go below zero). */
  async disburse(db: Kysely<TenantDatabase>, id: string, input: DisburseLoanDto, ctx: Context): Promise<LoanDto> {
    const loan = await this.requireStatus(db, id, ['approved']);
    const treasury = await this.usableTreasury(db, input.treasuryId, loan.currency);
    await withTransaction(db, async (trx) => {
      await this.treasuryMovements.assertCanWithdraw(trx, treasury.id, BigInt(loan.amount_minor));
      const updated = await trx
        .updateTable('hr_loans')
        .set({ status: 'active', treasury_id: treasury.id, disbursed_on: input.date, disbursed_by: ctx.userId })
        .where('id', '=', id)
        .where('status', '=', 'approved')
        .executeTakeFirst();
      if (!updated.numUpdatedRows) throw notInStatus();
      await this.writeEvent(trx, HR_LOAN_DISBURSED, ctx, id, {
        number: loan.number,
        loanNumber: loan.number,
        date: input.date,
        treasuryId: treasury.id,
        employeeName: loan.employee_name,
        amount: { amountMinorUnits: loan.amount_minor, currency: loan.currency },
      });
    });
    return this.get(db, id);
  }

  /** Cash paid back by the employee, oldest open installments first; the loan closes when nothing is left. */
  async repay(db: Kysely<TenantDatabase>, id: string, input: RepayLoanDto, ctx: Context): Promise<LoanDto> {
    const loan = await this.requireStatus(db, id, ['active']);
    const treasury = await this.usableTreasury(db, input.treasuryId, loan.currency);
    if (input.date < loan.disbursed_on!) {
      throw new BusinessRuleError('A repayment cannot come before the loan was paid out.', { code: 'HR_LOAN.REPAY_BEFORE_DISBURSE' });
    }
    const amount = BigInt(input.amountMinorUnits);
    await withTransaction(db, async (trx) => {
      const installments = await trx
        .selectFrom('hr_loan_installments')
        .select(['id', 'amount_minor', 'paid_minor'])
        .where('loan_id', '=', id)
        .orderBy('sequence')
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
      const repaymentId = randomUUID();
      const { formatted } = await this.numbering.allocateNext(trx, 'loan_repayment');
      await trx
        .insertInto('hr_loan_repayments')
        .values({
          id: repaymentId,
          number: formatted,
          loan_id: id,
          treasury_id: treasury.id,
          repaid_on: input.date,
          amount_minor: amount.toString(),
          currency: loan.currency,
          created_by: ctx.userId,
        })
        .execute();
      await closeIfRepaid(trx, id);
      await this.writeEvent(trx, HR_LOAN_REPAID, ctx, repaymentId, {
        number: formatted,
        loanNumber: loan.number,
        date: input.date,
        treasuryId: treasury.id,
        employeeName: loan.employee_name,
        amount: { amountMinorUnits: amount.toString(), currency: loan.currency },
      });
    });
    return this.get(db, id);
  }

  /** Skips a month: every open installment from `month` on moves one month later. */
  async postpone(db: Kysely<TenantDatabase>, id: string, input: PostponeLoanDto): Promise<LoanDto> {
    await this.requireStatus(db, id, ['pending', 'approved', 'active']);
    const from = monthStart(input.month);
    const open = await db
      .selectFrom('hr_loan_installments')
      .select(['id', 'due_month'])
      .where('loan_id', '=', id)
      .where('due_month', '>=', from)
      .whereRef('paid_minor', '<', 'amount_minor')
      .orderBy('sequence', 'desc')
      .execute();
    if (open.length === 0) {
      throw new BusinessRuleError('Nothing is due from that month on.', { code: 'HR_LOAN.NOTHING_TO_POSTPONE' });
    }
    await withTransaction(db, async (trx) => {
      for (const i of open) await trx.updateTable('hr_loan_installments').set({ due_month: addMonths(i.due_month, 1) }).where('id', '=', i.id).execute();
    });
    return this.get(db, id);
  }

  // ── bonuses and penalties ─────────────────────────────────────────────────

  async listAdjustments(db: Kysely<TenantDatabase>, query: PayAdjustmentQueryDto = {}): Promise<PayAdjustmentDto[]> {
    let q = db
      .selectFrom('hr_pay_adjustments as a')
      .innerJoin('employees as e', 'e.id', 'a.employee_id')
      .leftJoin('users as u', 'u.id', 'a.created_by')
      .select([
        'a.id',
        'a.employee_id',
        'e.code',
        'e.full_name',
        'a.kind',
        'a.pay_month',
        'a.amount_minor',
        'a.days',
        'a.reason',
        'a.payroll_run_id',
        'a.created_at',
        'u.full_name as created_by_name',
      ]);
    if (query.month) q = q.where('a.pay_month', '=', monthStart(query.month));
    if (query.employeeId) q = q.where('a.employee_id', '=', query.employeeId);
    if (query.kind) q = q.where('a.kind', '=', query.kind);
    const rows = await q.orderBy('a.pay_month', 'desc').orderBy('e.code').limit(10_000).execute();
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      employeeCode: r.code,
      employeeName: r.full_name,
      kind: r.kind as PayAdjustmentKindDto,
      month: r.pay_month.slice(0, 7),
      amountMinorUnits: r.amount_minor,
      days: r.days === null ? null : Number(r.days),
      reason: r.reason,
      settled: r.payroll_run_id !== null,
      createdAt: new Date(r.created_at).toISOString(),
      createdByName: r.created_by_name,
    }));
  }

  async createAdjustments(db: Kysely<TenantDatabase>, input: CreatePayAdjustmentsDto, userId: string | null): Promise<{ created: number }> {
    const ids = [...new Set(input.employeeIds)];
    const found = await db.selectFrom('employees').select(['id', 'status']).where('id', 'in', ids).execute();
    if (found.length !== ids.length) throw entityNotFound('EMPLOYEE', ids.find((x) => !found.some((f) => f.id === x)) ?? '');
    if (found.some((f) => f.status === 'terminated')) {
      throw new BusinessRuleError('One of the employees has left.', { code: 'EMPLOYEE.TERMINATED_READ_ONLY' });
    }
    await db
      .insertInto('hr_pay_adjustments')
      .values(
        ids.map((employeeId) => ({
          id: randomUUID(),
          employee_id: employeeId,
          kind: input.kind,
          pay_month: monthStart(input.month),
          amount_minor: input.amountMinorUnits ?? null,
          days: input.days == null ? null : String(input.days),
          reason: input.reason,
          created_by: userId,
        })),
      )
      .execute();
    return { created: ids.length };
  }

  /** Only while no payroll run has taken it. */
  async deleteAdjustment(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const row = await db.selectFrom('hr_pay_adjustments').select(['payroll_run_id']).where('id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('HR_PAY_ADJUSTMENT', id);
    if (row.payroll_run_id) {
      throw new BusinessRuleError('This line is already in a payroll run.', { code: 'HR_PAY_ADJUSTMENT.SETTLED' });
    }
    await db.deleteFrom('hr_pay_adjustments').where('id', '=', id).execute();
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async requireStatus(db: Kysely<TenantDatabase>, id: string, allowed: LoanStatusDto[]) {
    const loan = await db
      .selectFrom('hr_loans as l')
      .innerJoin('employees as e', 'e.id', 'l.employee_id')
      .select(['l.id', 'l.number', 'l.employee_id', 'l.status', 'l.amount_minor', 'l.currency', 'l.disbursed_on', 'e.full_name as employee_name'])
      .where('l.id', '=', id)
      .executeTakeFirst();
    if (!loan) throw entityNotFound('HR_LOAN', id);
    if (!allowed.includes(loan.status as LoanStatusDto)) throw notInStatus();
    return loan;
  }

  private async usableTreasury(db: Kysely<TenantDatabase>, treasuryId: string, currency: string) {
    const treasury = await findTreasury(db, treasuryId);
    if (!treasury) throw entityNotFound('TREASURY', treasuryId);
    if (!treasury.isActive) {
      throw new BusinessRuleError(`Treasury "${treasury.name}" is inactive.`, { code: 'TREASURY.INACTIVE', params: { name: treasury.name } });
    }
    if (treasury.currency !== currency) {
      throw new BusinessRuleError(`Treasury "${treasury.name}" is in ${treasury.currency}.`, {
        code: 'HR_LOAN.TREASURY_CURRENCY',
        params: { name: treasury.name, currency },
      });
    }
    return treasury;
  }

  private async decide(db: Kysely<TenantDatabase>, id: string, status: LoanStatusDto, input: LoanDecisionDto, userId: string | null) {
    await db
      .updateTable('hr_loans')
      .set({ status, decided_by: userId, decided_at: new Date(), decision_note: input.note?.trim() || null })
      .where('id', '=', id)
      .execute();
  }

  private writeEvent(trx: Kysely<TenantDatabase>, eventType: string, ctx: Context, entityId: string, metadata: HrLoanMoneyEventMetadata) {
    return this.outbox.write(trx, eventType, {
      schema: ctx.schema,
      entityType: eventType === HR_LOAN_DISBURSED ? 'loan' : 'loan_repayment',
      entityId,
      action: eventType === HR_LOAN_DISBURSED ? 'disbursed' : 'repaid',
      actorUserId: ctx.userId,
      occurredAt: new Date(),
      metadata: metadata as unknown as Record<string, unknown>,
    });
  }

  private summaryQuery(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('hr_loans as l')
      .innerJoin('employees as e', 'e.id', 'l.employee_id')
      .select([
        'l.id',
        'l.number',
        'l.employee_id',
        'e.code as employee_code',
        'e.full_name as employee_name',
        'l.amount_minor',
        'l.currency',
        'l.first_month',
        'l.status',
        'l.disbursed_on',
        'l.created_at',
        sql<string>`(SELECT count(*) FROM hr_loan_installments i WHERE i.loan_id = l.id)`.as('installment_count'),
        sql<string>`(SELECT coalesce(sum(i.amount_minor - i.paid_minor), 0) FROM hr_loan_installments i WHERE i.loan_id = l.id)`.as('remaining'),
      ]);
  }
}

/** A loan whose installments are all paid is closed (payroll deductions call this too). */
export async function closeIfRepaid(trx: Kysely<TenantDatabase>, loanId: string): Promise<void> {
  const open = await trx
    .selectFrom('hr_loan_installments')
    .select('id')
    .where('loan_id', '=', loanId)
    .whereRef('paid_minor', '<', 'amount_minor')
    .executeTakeFirst();
  if (!open) await trx.updateTable('hr_loans').set({ status: 'closed' }).where('id', '=', loanId).where('status', '=', 'active').execute();
}

async function assertNotOwn(db: Kysely<TenantDatabase>, employeeId: string, userId: string): Promise<void> {
  const own = await db.selectFrom('employees').select('id').where('id', '=', employeeId).where('user_id', '=', userId).executeTakeFirst();
  if (own) throw new BusinessRuleError('You cannot decide your own loan.', { code: 'HR_LOAN.SELF_APPROVAL' });
}

function notInStatus(): BusinessRuleError {
  return new BusinessRuleError('The loan is not in a state that allows this.', { code: 'HR_LOAN.WRONG_STATUS' });
}

async function companyCurrency(db: Kysely<TenantDatabase>): Promise<string> {
  const row = await db.selectFrom('tenant_settings').select('currency_code').executeTakeFirst();
  return row?.currency_code ?? 'EGP';
}

function toSummary(r: {
  id: string;
  number: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  amount_minor: string;
  currency: string;
  first_month: string;
  status: string;
  disbursed_on: string | null;
  created_at: Date;
  installment_count: string;
  remaining: string;
}): LoanSummaryDto {
  return {
    id: r.id,
    number: r.number,
    employeeId: r.employee_id,
    employeeCode: r.employee_code,
    employeeName: r.employee_name,
    amountMinorUnits: r.amount_minor,
    currency: r.currency,
    installmentCount: Number(r.installment_count),
    firstMonth: r.first_month.slice(0, 7),
    remainingMinorUnits: String(r.remaining),
    status: r.status as LoanStatusDto,
    disbursedOn: r.disbursed_on,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
