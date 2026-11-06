import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { Money } from '@erp-platform/shared-kernel';
import type { CustomerRefundDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import { TreasuryMovementRegistry } from '../../../../shared/treasury/treasury-movements';
import { resolvePaymentTreasury } from '../../../../shared/treasury/treasury-reader';
import { lockRowsForUpdate } from '../../../../shared/persistence/row-locks';
import { localIsoDate } from '../../../../shared/time/local-date';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { CustomerLedgerSource } from '../../infrastructure/statements/customer-ledger.source';
import { BusinessRuleError } from '../errors';

export const CUSTOMER_REFUND_POSTED = 'sales.customer_refund.posted';
export const CUSTOMER_REFUND_CANCELLED = 'sales.customer_refund.cancelled';

export type RefundMethod = 'cash' | 'bank_transfer' | 'card' | 'other';

export interface CreateCustomerRefundInput {
  customerId: string;
  amount: Money;
  paymentMethod: RefundMethod;
  treasuryId?: string | null;
  refundDate?: string | null;
  salesCreditNoteId?: string | null;
  posSessionId?: string | null;
  approvedByUserId?: string | null;
  reference?: string | null;
  notes?: string | null;
}

/** Outbox metadata of both refund events (Accounting posts / reverses it). */
export interface CustomerRefundEventMetadata {
  refundNumber: string;
  refundDate: string;
  customerId: string;
  paymentMethod: RefundMethod;
  treasuryId: string | null;
  amount: { amountMinorUnits: string; currency: string };
  reason?: string | null;
}

/**
 * رد مبلغ لعميل (migration 0113). Money paid back to a customer out of a
 * treasury — a POS return refunded at the till, or a credit balance paid
 * out. A refund can never exceed the credit the customer holds (credit
 * notes, overpayments) in that currency, so it never creates a receivable
 * out of thin air. Posted on creation, written with its outbox event in the
 * same transaction (CLAUDE.md §2.7); a mistake is corrected by cancelling.
 */
@Injectable()
export class CustomerRefundsService {
  constructor(
    private readonly numbering: NumberingSequencesService,
    private readonly outbox: OutboxWriterService,
    private readonly movements: TreasuryMovementRegistry,
    private readonly ledger: CustomerLedgerSource,
  ) {}

  async list(db: Kysely<TenantDatabase>, filters: { customerId?: string; posSessionId?: string } = {}): Promise<CustomerRefundDto[]> {
    let query = this.baseQuery(db);
    if (filters.customerId) query = query.where('r.customer_id', '=', filters.customerId);
    if (filters.posSessionId) query = query.where('r.pos_session_id', '=', filters.posSessionId);
    const rows = await query.orderBy('r.created_at', 'desc').limit(1000).execute();
    return rows.map(toDto);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<CustomerRefundDto> {
    const row = await this.baseQuery(db).where('r.id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('CUSTOMER_REFUND', id);
    return toDto(row);
  }

  /** The credit (in minor units, ≥ 0) a customer holds in a currency — what can be refunded. */
  async availableCredit(db: Kysely<TenantDatabase>, customerId: string, currency: string): Promise<bigint> {
    const entries = await this.ledger.listEntries(db, customerId);
    const balance = entries.filter((e) => e.currency === currency).reduce((sum, e) => sum + e.amountMinor, 0n);
    return balance < 0n ? -balance : 0n;
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreateCustomerRefundInput,
    context: { schema: string; actorUserId: string | null },
  ): Promise<CustomerRefundDto> {
    if (!input.amount.isPositive()) {
      throw new BusinessRuleError('A refund amount must be positive.', { code: 'CUSTOMER_REFUND.AMOUNT_NOT_POSITIVE' });
    }
    const currency = input.amount.currency;
    const amountMinor = input.amount.toMinorUnits();
    const id = randomUUID();

    await withTransaction(db, async (trx) => {
      // One refund at a time per customer, so two can't both spend the same credit.
      await lockRowsForUpdate(trx, 'customers', [input.customerId]);
      const customer = await trx.selectFrom('customers').select(['id', 'name']).where('id', '=', input.customerId).executeTakeFirst();
      if (!customer) throw entityNotFound('CUSTOMER', input.customerId);

      if (input.salesCreditNoteId) {
        const note = await trx
          .selectFrom('sales_credit_notes')
          .select(['id', 'customer_id'])
          .where('id', '=', input.salesCreditNoteId)
          .executeTakeFirst();
        if (!note) throw entityNotFound('SALES_CREDIT_NOTE', input.salesCreditNoteId);
        if (note.customer_id !== input.customerId) {
          throw new BusinessRuleError('The credit note belongs to another customer.', { code: 'CUSTOMER_REFUND.CREDIT_NOTE_MISMATCH' });
        }
      }

      const available = await this.availableCredit(trx, input.customerId, currency);
      if (amountMinor > available) {
        throw new BusinessRuleError(`The customer holds ${available} ${currency} of credit — can't refund ${amountMinor}.`, {
          code: 'CUSTOMER_REFUND.EXCEEDS_CREDIT',
          params: { available: formatMinor(available), amount: formatMinor(amountMinor), currency },
        });
      }

      const treasuryId = await resolvePaymentTreasury(trx, { treasuryId: input.treasuryId, paymentMethod: input.paymentMethod, currency });
      if (!treasuryId) {
        throw new BusinessRuleError('Choose the treasury the refund is paid from.', { code: 'CUSTOMER_REFUND.TREASURY_REQUIRED' });
      }
      await this.movements.assertCanWithdraw(trx, treasuryId, amountMinor);

      const number = await this.numbering.allocateNext(trx, 'customer_refund', null);
      const refundDate = input.refundDate ?? localIsoDate(new Date());
      await trx
        .insertInto('customer_refunds')
        .values({
          id,
          refund_number: number.formatted,
          customer_id: input.customerId,
          refund_date: refundDate,
          payment_method: input.paymentMethod,
          treasury_id: treasuryId,
          amount: amountMinor.toString(),
          currency,
          sales_credit_note_id: input.salesCreditNoteId ?? null,
          pos_session_id: input.posSessionId ?? null,
          approved_by_user_id: input.approvedByUserId ?? null,
          created_by_user_id: context.actorUserId,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
        })
        .execute();
      await this.writeEvent(trx, CUSTOMER_REFUND_POSTED, context, id, {
        refundNumber: number.formatted,
        refundDate,
        customerId: input.customerId,
        paymentMethod: input.paymentMethod,
        treasuryId,
        amount: { amountMinorUnits: amountMinor.toString(), currency },
      });
    });
    return this.getById(db, id);
  }

  async cancel(
    db: Kysely<TenantDatabase>,
    id: string,
    reason: string,
    context: { schema: string; actorUserId: string | null },
  ): Promise<CustomerRefundDto> {
    await withTransaction(db, async (trx) => {
      const row = await trx.selectFrom('customer_refunds').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!row) throw entityNotFound('CUSTOMER_REFUND', id);
      if (row.status !== 'posted') {
        throw new BusinessRuleError('The refund is already cancelled.', { code: 'CUSTOMER_REFUND.ALREADY_CANCELLED' });
      }
      if (row.pos_session_id) {
        const session = await trx.selectFrom('pos_sessions').select('status').where('id', '=', row.pos_session_id).executeTakeFirst();
        // A closed shift's cash count is final — its refunds stay.
        if (session?.status === 'closed') {
          throw new BusinessRuleError('This refund belongs to a closed POS shift.', { code: 'CUSTOMER_REFUND.SESSION_CLOSED' });
        }
      }
      await trx
        .updateTable('customer_refunds')
        .set({ status: 'cancelled', cancelled_at: new Date(), cancel_reason: reason, updated_at: new Date() })
        .where('id', '=', id)
        .execute();
      await this.writeEvent(trx, CUSTOMER_REFUND_CANCELLED, context, id, {
        refundNumber: row.refund_number,
        refundDate: localIsoDate(new Date()),
        customerId: row.customer_id,
        paymentMethod: row.payment_method as RefundMethod,
        treasuryId: row.treasury_id,
        amount: { amountMinorUnits: row.amount, currency: row.currency },
        reason,
      });
    });
    return this.getById(db, id);
  }

  private writeEvent(
    trx: Kysely<TenantDatabase>,
    eventType: string,
    context: { schema: string; actorUserId: string | null },
    id: string,
    metadata: CustomerRefundEventMetadata,
  ): Promise<void> {
    return this.outbox.write(trx, eventType, {
      schema: context.schema,
      entityType: 'customer_refund',
      entityId: id,
      action: eventType === CUSTOMER_REFUND_POSTED ? 'posted' : 'cancelled',
      actorUserId: context.actorUserId,
      occurredAt: new Date(),
      metadata: metadata as unknown as Record<string, unknown>,
    });
  }

  private baseQuery(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('customer_refunds as r')
      .innerJoin('customers as c', 'c.id', 'r.customer_id')
      .leftJoin('treasuries as t', 't.id', 'r.treasury_id')
      .selectAll('r')
      .select(['c.name as customer_name', 't.name as treasury_name']);
  }
}

type RefundRow = {
  id: string;
  refund_number: string;
  customer_id: string;
  customer_name: string;
  status: string;
  refund_date: string | Date;
  payment_method: string;
  treasury_id: string | null;
  treasury_name: string | null;
  amount: string;
  currency: string;
  sales_credit_note_id: string | null;
  pos_session_id: string | null;
  reference: string | null;
  notes: string | null;
  created_at: Date;
  cancelled_at: Date | null;
  cancel_reason: string | null;
};

function toDto(row: RefundRow): CustomerRefundDto {
  return {
    id: row.id,
    refundNumber: row.refund_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    status: row.status as 'posted' | 'cancelled',
    refundDate: typeof row.refund_date === 'string' ? row.refund_date.slice(0, 10) : localIsoDate(row.refund_date),
    paymentMethod: row.payment_method as RefundMethod,
    treasuryId: row.treasury_id,
    treasuryName: row.treasury_name,
    amount: { amountMinorUnits: row.amount, currency: row.currency },
    salesCreditNoteId: row.sales_credit_note_id,
    posSessionId: row.pos_session_id,
    reference: row.reference,
    notes: row.notes,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
  };
}

function formatMinor(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}
