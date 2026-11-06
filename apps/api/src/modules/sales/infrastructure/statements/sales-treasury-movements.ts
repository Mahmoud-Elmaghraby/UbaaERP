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
 * (money in), refunds paid back to customers (money out) and POS cash-count differences (over = in, short = out) of the
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
      .select(['p.id', 'p.payment_number', 'p.payment_date', 'p.created_at', 'p.amount_amount', 'p.amount_currency', 'p.treasury_id', 'p.reference_number', 'c.name', 'p.payment_method', 'p.cheque_status_date', 'p.cheque_number'])
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

    // Fees a marketplace kept on a posted settlement leave the channel's treasury.
    let fees = db
      .selectFrom('channel_settlement_lines as l')
      .innerJoin('channel_settlements as s', 's.id', 'l.channel_settlement_id')
      .innerJoin('sales_channels as ch', 'ch.id', 's.sales_channel_id')
      .select(['s.id', 's.settlement_number', 's.statement_date', 's.currency', 's.created_at', 'ch.treasury_id', 'ch.name'])
      .select((eb) => eb.fn.sum<string>('l.amount').as('total'))
      .where('s.status', '=', 'posted')
      .where('l.kind', '=', 'fee')
      .where('ch.treasury_id', 'is not', null)
      .groupBy(['s.id', 'ch.treasury_id', 'ch.name']);
    if (treasuryId) fees = fees.where('ch.treasury_id', '=', treasuryId);

    let refunds = db
      .selectFrom('customer_refunds as r')
      .innerJoin('customers as c', 'c.id', 'r.customer_id')
      .select(['r.id', 'r.refund_number', 'r.refund_date', 'r.amount', 'r.currency', 'r.treasury_id', 'r.reference', 'r.created_at', 'c.name'])
      .where('r.status', '=', 'posted')
      .where('r.treasury_id', 'is not', null);
    if (treasuryId) refunds = refunds.where('r.treasury_id', '=', treasuryId);

    const [receiptRows, sessionRows, feeRows, refundRows] = await Promise.all([
      receipts.execute(),
      sessions.execute(),
      fees.execute(),
      refunds.execute(),
    ]);
    return [
      ...receiptRows.map((r) => ({
        treasuryId: r.treasury_id!,
        // A cheque enters the bank on the day it was collected.
        date:
          r.payment_method === 'check' && r.cheque_status_date
            ? String(r.cheque_status_date).slice(0, 10)
            : (r.payment_date ?? localIsoDate(r.created_at)),
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
      ...feeRows.map((f) => ({
        treasuryId: f.treasury_id!,
        date: f.statement_date,
        amountMinor: -BigInt(f.total),
        currency: f.currency,
        kind: 'marketplace_fees' as const,
        documentId: f.id,
        number: f.settlement_number,
        counterparty: f.name,
        description: null,
        sequence: f.created_at.toISOString(),
      })),
      ...refundRows.map((r) => ({
        treasuryId: r.treasury_id!,
        date: typeof r.refund_date === 'string' ? r.refund_date.slice(0, 10) : localIsoDate(r.refund_date),
        amountMinor: -BigInt(r.amount),
        currency: r.currency,
        kind: 'customer_refund' as const,
        documentId: r.id,
        number: r.refund_number,
        counterparty: r.name,
        description: r.reference,
        sequence: r.created_at.toISOString(),
      })),
    ];
  }
}
