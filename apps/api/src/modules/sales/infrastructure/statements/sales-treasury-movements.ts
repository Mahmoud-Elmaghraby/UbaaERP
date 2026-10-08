import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { localIsoDate } from '../../../../shared/time/local-date';
import {
  TreasuryMovementRegistry,
  type TreasuryMovement,
  type TreasuryMovementSource,
} from '../../../../shared/treasury/treasury-movements';

/**
 * Sales' money movements for the Treasury module: posted customer receipts
 * (money in) and POS cash-count differences (over = in, short = out) of the
 * session's cash box.
 */
@Injectable()
export class SalesTreasuryMovements implements TreasuryMovementSource, OnModuleInit {
  constructor(private readonly registry: TreasuryMovementRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async listMovements(db: Kysely<TenantDatabase>, treasuryId: string | null): Promise<TreasuryMovement[]> {
    let receipts = db
      .selectFrom('payments_received as p')
      .innerJoin('customers as c', 'c.id', 'p.customer_id')
      .select(['p.id', 'p.payment_number', 'p.payment_date', 'p.created_at', 'p.amount_amount', 'p.amount_currency', 'p.treasury_id', 'p.reference_number', 'c.name'])
      .where('p.status', '=', 'posted')
      .where('p.treasury_id', 'is not', null);
    if (treasuryId) receipts = receipts.where('p.treasury_id', '=', treasuryId);

    let sessions = db
      .selectFrom('pos_sessions')
      .select(['id', 'variance_amount', 'currency', 'treasury_id', 'closed_at'])
      .where('status', '=', 'closed')
      .where('treasury_id', 'is not', null)
      .where('variance_amount', 'is not', null)
      .where('variance_amount', '<>', '0');
    if (treasuryId) sessions = sessions.where('treasury_id', '=', treasuryId);

    const [receiptRows, sessionRows] = await Promise.all([receipts.execute(), sessions.execute()]);
    return [
      ...receiptRows.map((r) => ({
        treasuryId: r.treasury_id!,
        date: r.payment_date ?? localIsoDate(r.created_at),
        amountMinor: BigInt(r.amount_amount),
        currency: r.amount_currency,
        kind: 'payment_received' as const,
        documentId: r.id,
        number: r.payment_number,
        counterparty: r.name,
        description: r.reference_number,
        sequence: r.created_at.toISOString(),
      })),
      ...sessionRows.map((s) => ({
        treasuryId: s.treasury_id!,
        date: localIsoDate(s.closed_at ?? new Date()),
        amountMinor: BigInt(s.variance_amount!),
        currency: s.currency,
        kind: 'pos_variance' as const,
        documentId: s.id,
        number: s.id.slice(0, 8),
        counterparty: null,
        description: null,
        sequence: (s.closed_at ?? new Date()).toISOString(),
      })),
    ];
  }
}
