import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { ReceivedChequeDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import { lockRowsForUpdate } from '../../../../shared/persistence/row-locks';
import { localIsoDate } from '../../../../shared/time/local-date';
import { resolvePaymentTreasury } from '../../../../shared/treasury/treasury-reader';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { BusinessRuleError } from '../errors';

/**
 * أوراق القبض — the cheques customers paid with (receipts with payment
 * method 'check', migration 0112). While in hand a cheque sits in the
 * notes-receivable account; collecting it moves it into a bank, a bounce
 * turns the receipt void (the customer owes again, its invoices reopen),
 * and endorsing it to a supplier happens from the supplier payment
 * (Purchases) and is recorded here by ChequeEndorsementListener.
 */
@Injectable()
export class ReceivedChequesService {
  constructor(private readonly outbox: OutboxWriterService) {}

  async list(db: Kysely<TenantDatabase>, filters: { status?: string; customerId?: string } = {}): Promise<ReceivedChequeDto[]> {
    let query = db
      .selectFrom('payments_received as p')
      .innerJoin('customers as c', 'c.id', 'p.customer_id')
      .leftJoin('treasuries as t', 't.id', 'p.treasury_id')
      .leftJoin('supplier_payments as sp', 'sp.id', 'p.cheque_endorsed_to_payment_id')
      .leftJoin('suppliers as s', 's.id', 'sp.supplier_id')
      .select([
        'p.id',
        'p.payment_number',
        'p.payment_date',
        'p.amount_amount',
        'p.amount_currency',
        'p.cheque_number',
        'p.cheque_bank',
        'p.cheque_due_date',
        'p.cheque_status',
        'p.cheque_status_date',
        'p.customer_id',
        'c.name as customer_name',
        't.name as treasury_name',
        'sp.id as endorsed_payment_id',
        's.name as endorsed_supplier_name',
      ])
      .where('p.payment_method', '=', 'check')
      .where('p.cheque_status', 'is not', null);
    if (filters.status) query = query.where('p.cheque_status', '=', filters.status);
    if (filters.customerId) query = query.where('p.customer_id', '=', filters.customerId);
    const rows = await query.orderBy('p.cheque_due_date').limit(2000).execute();
    return rows.map((r) => ({
      id: r.id,
      paymentNumber: r.payment_number,
      paymentDate: r.payment_date ? String(r.payment_date).slice(0, 10) : null,
      customerId: r.customer_id,
      customerName: r.customer_name,
      chequeNumber: r.cheque_number,
      bank: r.cheque_bank,
      dueDate: r.cheque_due_date ? String(r.cheque_due_date).slice(0, 10) : null,
      status: r.cheque_status as ReceivedChequeDto['status'],
      statusDate: r.cheque_status_date ? String(r.cheque_status_date).slice(0, 10) : null,
      amount: { amountMinorUnits: r.amount_amount, currency: r.amount_currency },
      treasuryName: r.treasury_name,
      endorsedToPaymentId: r.endorsed_payment_id,
      endorsedToSupplierName: r.endorsed_supplier_name,
    }));
  }

  /** Deposited and paid by the bank: the money is in `treasuryId` from `date`. */
  async collect(db: Kysely<TenantDatabase>, id: string, input: { treasuryId: string; date?: string | null }, ctx: { schema: string; actorUserId: string | null }): Promise<void> {
    await withTransaction(db, async (trx) => {
      const cheque = await this.inHand(trx, id);
      const treasuryId = await resolvePaymentTreasury(trx, { treasuryId: input.treasuryId, paymentMethod: 'bank_transfer', currency: cheque.amount_currency });
      const date = input.date || localIsoDate();
      await trx
        .updateTable('payments_received')
        .set({ cheque_status: 'collected', cheque_status_date: date, treasury_id: treasuryId, updated_at: new Date() })
        .where('id', '=', id)
        .execute();
      await this.event(trx, 'sales.cheque.collected', cheque, date, treasuryId, ctx);
    });
  }

  /** Returned unpaid: the receipt no longer counts — the customer owes the amount again. */
  async bounce(db: Kysely<TenantDatabase>, id: string, input: { date?: string | null }, ctx: { schema: string; actorUserId: string | null }): Promise<void> {
    await withTransaction(db, async (trx) => {
      const cheque = await this.inHand(trx, id);
      const date = input.date || localIsoDate();
      await trx
        .updateTable('payments_received')
        .set({ status: 'bounced', cheque_status: 'bounced', cheque_status_date: date, updated_at: new Date() })
        .where('id', '=', id)
        .execute();
      await this.event(trx, 'sales.cheque.bounced', cheque, date, null, ctx);
    });
  }

  /** Called when a supplier payment that endorses this cheque is posted. */
  async markEndorsed(db: Kysely<TenantDatabase>, id: string, supplierPaymentId: string, date: string): Promise<void> {
    await db
      .updateTable('payments_received')
      .set({ cheque_status: 'endorsed', cheque_status_date: date, cheque_endorsed_to_payment_id: supplierPaymentId, updated_at: new Date() })
      .where('id', '=', id)
      .where('cheque_status', '=', 'in_hand')
      .execute();
  }

  private async inHand(trx: Kysely<TenantDatabase>, id: string) {
    await lockRowsForUpdate(trx, 'payments_received', [id]);
    const cheque = await trx.selectFrom('payments_received').selectAll().where('id', '=', id).where('payment_method', '=', 'check').executeTakeFirst();
    if (!cheque) throw entityNotFound('PAYMENT', id);
    const endorsing = await trx
      .selectFrom('supplier_payments')
      .select('payment_number')
      .where('endorsed_cheque_id', '=', id)
      .where('status', '!=', 'cancelled')
      .executeTakeFirst();
    if (cheque.cheque_status !== 'in_hand' || endorsing) {
      throw new BusinessRuleError(`Cheque on receipt "${cheque.payment_number}" is not in hand (${cheque.cheque_status}).`, {
        code: 'CHEQUE.NOT_IN_HAND',
        params: { number: cheque.cheque_number ?? cheque.payment_number, status: endorsing ? 'endorsed' : (cheque.cheque_status ?? '') },
      });
    }
    return cheque;
  }

  private async event(
    trx: Kysely<TenantDatabase>,
    eventType: string,
    cheque: { id: string; payment_number: string; cheque_number: string | null; payment_date: string | null; amount_amount: string; amount_currency: string; customer_id: string },
    date: string,
    treasuryId: string | null,
    ctx: { schema: string; actorUserId: string | null },
  ): Promise<void> {
    await this.outbox.write(trx, eventType, {
      schema: ctx.schema,
      entityType: 'payment_received',
      entityId: cheque.id,
      action: eventType.split('.').pop()!,
      actorUserId: ctx.actorUserId,
      occurredAt: new Date(),
      metadata: {
        paymentNumber: cheque.payment_number,
        chequeNumber: cheque.cheque_number,
        date,
        paymentDate: cheque.payment_date ? String(cheque.payment_date).slice(0, 10) : null,
        treasuryId,
        customerId: cheque.customer_id,
        amount: { amountMinorUnits: cheque.amount_amount, currency: cheque.amount_currency },
      },
    });
  }
}
