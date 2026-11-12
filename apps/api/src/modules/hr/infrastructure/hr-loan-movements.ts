import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { TreasuryMovementRegistry, type TreasuryMovement, type TreasuryMovementSource } from '../../../shared/treasury/treasury-movements';

/** Loans paid out of a treasury (out) and cash paid back into one (in), for treasury balances and statements. */
@Injectable()
export class HrLoanMovements implements TreasuryMovementSource, OnModuleInit {
  constructor(private readonly registry: TreasuryMovementRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async listMovements(db: Kysely<TenantDatabase>, treasuryId: string | null): Promise<TreasuryMovement[]> {
    let loans = db
      .selectFrom('hr_loans as l')
      .innerJoin('employees as e', 'e.id', 'l.employee_id')
      .select(['l.id', 'l.number', 'l.treasury_id', 'l.disbursed_on', 'l.amount_minor', 'l.currency', 'l.created_at', 'e.full_name'])
      .where('l.status', 'in', ['active', 'closed']);
    if (treasuryId) loans = loans.where('l.treasury_id', '=', treasuryId);
    let repayments = db
      .selectFrom('hr_loan_repayments as r')
      .innerJoin('hr_loans as l', 'l.id', 'r.loan_id')
      .innerJoin('employees as e', 'e.id', 'l.employee_id')
      .select(['r.id', 'r.number', 'r.treasury_id', 'r.repaid_on', 'r.amount_minor', 'r.currency', 'r.created_at', 'e.full_name', 'l.number as loan_number']);
    if (treasuryId) repayments = repayments.where('r.treasury_id', '=', treasuryId);

    const out: TreasuryMovement[] = [];
    for (const l of await loans.execute()) {
      out.push({
        treasuryId: l.treasury_id!,
        date: l.disbursed_on!,
        amountMinor: -BigInt(l.amount_minor),
        currency: l.currency,
        kind: 'employee_loan',
        documentId: l.id,
        number: l.number,
        counterparty: l.full_name,
        description: null,
        sequence: new Date(l.created_at).toISOString(),
      });
    }
    for (const r of await repayments.execute()) {
      out.push({
        treasuryId: r.treasury_id,
        date: r.repaid_on,
        amountMinor: BigInt(r.amount_minor),
        currency: r.currency,
        kind: 'employee_loan_repayment',
        documentId: r.id,
        number: r.number,
        counterparty: r.full_name,
        description: r.loan_number,
        sequence: new Date(r.created_at).toISOString(),
      });
    }
    return out;
  }
}
