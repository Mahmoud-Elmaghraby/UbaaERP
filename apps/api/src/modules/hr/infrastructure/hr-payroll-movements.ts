import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { TreasuryMovementRegistry, type TreasuryMovement, type TreasuryMovementSource } from '../../../shared/treasury/treasury-movements';

/** Salaries paid out of a treasury, for treasury balances and statements. */
@Injectable()
export class HrPayrollMovements implements TreasuryMovementSource, OnModuleInit {
  constructor(private readonly registry: TreasuryMovementRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async listMovements(db: Kysely<TenantDatabase>, treasuryId: string | null): Promise<TreasuryMovement[]> {
    let q = db
      .selectFrom('hr_payroll_payments as p')
      .innerJoin('hr_payroll_runs as r', 'r.id', 'p.run_id')
      .select(['p.id', 'p.number', 'p.treasury_id', 'p.paid_on', 'p.amount_minor', 'p.currency', 'p.created_at', 'p.line_count', 'r.number as run_number', 'r.pay_month'])
      .where('p.amount_minor', '>', '0');
    if (treasuryId) q = q.where('p.treasury_id', '=', treasuryId);
    return (await q.execute()).map((p) => ({
      treasuryId: p.treasury_id,
      date: p.paid_on,
      amountMinor: -BigInt(p.amount_minor),
      currency: p.currency,
      kind: 'payroll',
      documentId: p.id,
      number: p.number,
      counterparty: `${p.run_number} — ${p.pay_month.slice(0, 7)}`,
      description: `${p.line_count}`,
      sequence: new Date(p.created_at).toISOString(),
    }));
  }
}
