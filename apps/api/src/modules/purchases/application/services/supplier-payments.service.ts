import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { findTreasury, resolvePaymentTreasury } from '../../../../shared/treasury/treasury-reader';
import { TreasuryMovementRegistry } from '../../../../shared/treasury/treasury-movements';
import { entityNotFound, statusChanged } from '../../../../shared/errors/entity-errors';
import { lockRowsForUpdate } from '../../../../shared/persistence/row-locks';
import { localIsoDate } from '../../../../shared/time/local-date';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import {
  SUPPLIER_PAYMENT_REPOSITORY,
  type SupplierPaymentRepository,
} from '../ports/supplier-payment.repository';
import {
  SUPPLIER_PAYMENT_ALLOCATION_REPOSITORY,
  type SupplierPaymentAllocationRepository,
} from '../ports/supplier-payment-allocation.repository';
import { SUPPLIER_REPOSITORY, type SupplierRepository } from '../ports/supplier.repository';
import { PURCHASE_ORDER_REPOSITORY, type PurchaseOrderRepository } from '../ports/purchase-order.repository';
import { PURCHASE_INVOICE_REPOSITORY, type PurchaseInvoiceRepository } from '../ports/purchase-invoice.repository';
import { readPurchaseInvoiceBalances } from './purchase-invoice-balances';
import {
  calculateSupplierPaymentUnallocated,
  type CreateSupplierPaymentInput,
  type SupplierOutstandingInvoice,
  type SupplierPayment,
  type SupplierPaymentAllocation,
  type SupplierPaymentWithAllocations,
} from '../../domain/supplier-payment.entity';
import { BusinessRuleError, isPostgresForeignKeyViolation } from '../errors';

type AllocationRequest = { purchaseInvoiceId: string; allocatedAmount: Money };

function allocationsMetadata(allocations: SupplierPaymentAllocation[]) {
  return allocations.map((a) => ({
    allocationId: a.id,
    purchaseInvoiceId: a.purchaseInvoiceId,
    allocatedAmount: {
      amountMinorUnits: a.allocatedAmount.toMinorUnits().toString(),
      currency: a.allocatedAmount.currency,
    },
  }));
}

/**
 * Supplier Payments — the Purchases mirror of PaymentsReceivedService,
 * so payables can be settled (migration 0090).
 *
 * create() persists a 'draft' payment with its optional allocations in one
 * transaction; post() flips it to 'posted' and writes
 * 'purchases.supplier_payment.posted' to the Outbox in the SAME
 * transaction (CLAUDE.md §2.7) — Accounting turns that into Dr Accounts
 * Payable / Cr cash-or-bank. allocate() applies a posted payment's
 * remainder to more invoices ('purchases.supplier_payment.allocated').
 *
 * Allocation rules (re-checked on post, since another payment may have
 * posted against the same invoice meanwhile): the purchase invoice must
 * exist, be 'posted' and belong to the payment's supplier (via its
 * purchase order); currencies must match; an invoice can't be paid beyond
 * its total minus other posted payments' allocations and the debit notes
 * credited to it (readPurchaseInvoiceBalances); and the allocations
 * can't exceed the amount available on this payment.
 */
@Injectable()
export class SupplierPaymentsService {
  constructor(
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepository,
    @Inject(SUPPLIER_PAYMENT_ALLOCATION_REPOSITORY) private readonly allocations: SupplierPaymentAllocationRepository,
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepository,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly purchaseOrders: PurchaseOrderRepository,
    @Inject(PURCHASE_INVOICE_REPOSITORY) private readonly purchaseInvoices: PurchaseInvoiceRepository,
    private readonly numberingSequences: NumberingSequencesService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly treasuryMovements: TreasuryMovementRegistry,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<SupplierPayment[]> {
    return this.payments.list(db);
  }

  listBySupplierId(db: Kysely<TenantDatabase>, supplierId: string): Promise<SupplierPayment[]> {
    return this.payments.listBySupplierId(db, supplierId);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<SupplierPaymentWithAllocations> {
    const payment = await this.payments.findById(db, id);
    if (!payment) throw entityNotFound('SUPPLIER_PAYMENT', id);
    const allocations = await this.allocations.listBySupplierPaymentId(db, id);
    return { ...payment, allocations, unallocatedAmount: calculateSupplierPaymentUnallocated(payment.amount, allocations) };
  }

  /** The supplier's posted purchase invoices with total / paid (posted payments only) / outstanding (net of debit notes). */
  async listOutstandingInvoices(db: Kysely<TenantDatabase>, supplierId: string): Promise<SupplierOutstandingInvoice[]> {
    const invoices = await this.purchaseInvoices.listPostedBySupplierId(db, supplierId);
    const balances = await readPurchaseInvoiceBalances(
      db,
      invoices.map((i) => i.purchaseOrderId),
    );
    const result: SupplierOutstandingInvoice[] = [];
    for (const invoice of invoices) {
      const balance = balances.get(invoice.id);
      if (!balance) continue;
      result.push({
        purchaseInvoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierInvoiceNumber: invoice.supplierInvoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        totalAmount: balance.total,
        paidAmount: balance.paid,
        outstandingAmount: balance.outstanding,
      });
    }
    return result;
  }

  /**
   * Re-checks requested allocations against each invoice's outstanding
   * balance (total − posted payments − debit notes). When it guards a write,
   * call it with the transaction after locking the payment and the invoices
   * (lockRowsForUpdate) so two payments can't take the same balance.
   */
  private async validateAllocations(
    db: Kysely<TenantDatabase>,
    supplierId: string,
    currency: string,
    ceiling: Money,
    allocationInputs: AllocationRequest[],
  ): Promise<void> {
    if (allocationInputs.length === 0) return;

    const invoiceIds = [...new Set(allocationInputs.map((a) => a.purchaseInvoiceId))];

    const requestedByInvoice = new Map<string, Money>();
    let totalRequested = Money.zero(currency);
    for (const allocation of allocationInputs) {
      if (allocation.allocatedAmount.currency !== currency) {
        throw new BusinessRuleError(
          `Allocation currency "${allocation.allocatedAmount.currency}" does not match the payment's currency "${currency}".`,
          {
            code: 'SUPPLIER_PAYMENT.ALLOCATION_CURRENCY_MISMATCH',
            params: { allocationCurrency: allocation.allocatedAmount.currency, paymentCurrency: currency },
          },
        );
      }
      const running = requestedByInvoice.get(allocation.purchaseInvoiceId);
      requestedByInvoice.set(
        allocation.purchaseInvoiceId,
        running ? running.add(allocation.allocatedAmount) : allocation.allocatedAmount,
      );
      totalRequested = totalRequested.add(allocation.allocatedAmount);
    }
    if (totalRequested.greaterThan(ceiling)) {
      throw new BusinessRuleError(
        `Total allocated amount (${totalRequested.toDecimalString()}) exceeds the available amount (${ceiling.toDecimalString()}).`,
        {
          code: 'SUPPLIER_PAYMENT.ALLOCATION_EXCEEDS_AVAILABLE',
          params: { requested: totalRequested.toDecimalString(), available: ceiling.toDecimalString() },
        },
      );
    }

    const orderIds: string[] = [];
    for (const invoiceId of invoiceIds) {
      const invoice = await this.purchaseInvoices.findById(db, invoiceId);
      if (!invoice) throw entityNotFound('PURCHASE_INVOICE', invoiceId);
      if (invoice.status !== 'posted') {
        throw new BusinessRuleError(
          `Purchase invoice "${invoiceId}" is "${invoice.status}" — only a posted invoice can be paid.`,
          { code: 'SUPPLIER_PAYMENT.INVOICE_NOT_POSTED', params: { id: invoiceId, status: invoice.status } },
        );
      }

      const order = await this.purchaseOrders.findById(db, invoice.purchaseOrderId);
      if (!order || order.supplierId !== supplierId) {
        throw new BusinessRuleError(`Purchase invoice "${invoiceId}" does not belong to supplier "${supplierId}".`, {
          code: 'SUPPLIER_PAYMENT.INVOICE_SUPPLIER_MISMATCH',
          params: { invoiceId, supplierId },
        });
      }
      orderIds.push(invoice.purchaseOrderId);
    }

    const balances = await readPurchaseInvoiceBalances(db, orderIds);
    for (const invoiceId of invoiceIds) {
      const balance = balances.get(invoiceId);
      if (!balance) throw entityNotFound('PURCHASE_INVOICE', invoiceId);
      const invoiceTotal = balance.total;
      const requested = requestedByInvoice.get(invoiceId)!;
      if (requested.currency !== invoiceTotal.currency) {
        throw new BusinessRuleError(
          `Allocation currency "${requested.currency}" does not match purchase invoice "${invoiceId}"'s currency "${invoiceTotal.currency}".`,
          {
            code: 'SUPPLIER_PAYMENT.INVOICE_CURRENCY_MISMATCH',
            params: { requestedCurrency: requested.currency, invoiceCurrency: invoiceTotal.currency },
          },
        );
      }

      const alreadyPaid = balance.paid;
      const outstanding = balance.outstanding;
      if (requested.greaterThan(outstanding)) {
        throw new BusinessRuleError(
          `Cannot allocate ${requested.toDecimalString()} to purchase invoice "${invoiceId}" — only ` +
            `${outstanding.toDecimalString()} is outstanding.`,
          {
            code: 'SUPPLIER_PAYMENT.ALLOCATION_EXCEEDS_OUTSTANDING',
            params: {
              requested: requested.toDecimalString(),
              outstanding: outstanding.toDecimalString(),
              total: invoiceTotal.toDecimalString(),
              alreadyPaid: alreadyPaid.toDecimalString(),
              debited: balance.debited.toDecimalString(),
            },
          },
        );
      }
    }
  }

  async create(db: Kysely<TenantDatabase>, input: CreateSupplierPaymentInput): Promise<SupplierPaymentWithAllocations> {
    const supplier = await this.suppliers.findById(db, input.supplierId);
    if (!supplier) throw entityNotFound('SUPPLIER', input.supplierId);

    const allocationInputs = input.allocations ?? [];
    await this.validateAllocations(db, input.supplierId, input.amount.currency, input.amount, allocationInputs);
    if (input.endorsedChequeId) {
      await this.assertEndorsable(db, input.endorsedChequeId, input.amount);
    } else if (input.paymentMethod === 'check' && (!input.cheque?.number?.trim() || !input.cheque.dueDate)) {
      throw new BusinessRuleError('A cheque payment needs the cheque number and due date.', { code: 'CHEQUE.DETAILS_REQUIRED' });
    }
    // An endorsed customer cheque never touches our treasuries; our own cheque is drawn on a bank.
    const treasuryId = input.endorsedChequeId
      ? null
      : await resolvePaymentTreasury(db, {
          treasuryId: input.treasuryId,
          paymentMethod: input.paymentMethod,
          currency: input.amount.currency,
        });
    if (!input.endorsedChequeId && input.paymentMethod === 'check') await this.assertChequeBank(db, treasuryId);

    try {
      return await withTransaction(db, async (trx) => {
        const allocated = await this.numberingSequences.allocateNext(trx, 'supplier_payment', null);
        const payment = await this.payments.create(trx, {
          paymentNumber: allocated.formatted,
          supplierId: input.supplierId,
          paymentDate: input.paymentDate ?? null,
          paymentMethod: input.endorsedChequeId ? 'check' : input.paymentMethod,
          referenceNumber: input.referenceNumber ?? null,
          amount: input.amount,
          treasuryId,
          notes: input.notes ?? null,
          customFields: input.customFields ?? {},
          cheque: input.paymentMethod === 'check' && !input.endorsedChequeId && input.cheque ? { number: input.cheque.number.trim(), bank: input.cheque.bank ?? null, dueDate: input.cheque.dueDate } : null,
          endorsedChequeId: input.endorsedChequeId ?? null,
        });

        const created: SupplierPaymentAllocation[] = [];
        for (const allocation of allocationInputs) {
          created.push(await this.allocations.create(trx, payment.id, allocation));
        }
        return { ...payment, allocations: created, unallocatedAmount: calculateSupplierPaymentUnallocated(payment.amount, created) };
      });
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new BusinessRuleError('The given supplier or purchase invoice does not exist.', {
          code: 'SUPPLIER_PAYMENT.SUPPLIER_OR_INVOICE_NOT_FOUND',
        });
      }
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError('No numbering sequence configured for supplier payments yet.', {
          code: 'SUPPLIER_PAYMENT.NO_NUMBERING_SEQUENCE',
        });
      }
      throw err;
    }
  }

  /**
   * The one-way door: status → posted + 'purchases.supplier_payment.posted' outbox row, atomically (§2.7).
   * Everything is re-checked inside the transaction under row locks (the payment, then its invoices),
   * so two drafts on the same invoice posted at once can't both take its outstanding balance.
   */
  async post(
    db: Kysely<TenantDatabase>,
    id: string,
    schema: string,
    actorUserId: string | null,
  ): Promise<SupplierPaymentWithAllocations> {
    return withTransaction(db, async (trx) => {
      await lockRowsForUpdate(trx, 'supplier_payments', [id]);
      const existing = await this.payments.findById(trx, id);
      if (!existing) throw entityNotFound('SUPPLIER_PAYMENT', id);
      if (existing.status !== 'draft') {
        throw new BusinessRuleError(
          `Cannot post supplier payment "${id}" from status "${existing.status}" (expected "draft").`,
          { code: 'SUPPLIER_PAYMENT.NOT_POSTABLE', params: { id, status: existing.status } },
        );
      }

      const allocations = await this.allocations.listBySupplierPaymentId(trx, id);
      await lockRowsForUpdate(trx, 'purchase_invoices', allocations.map((a) => a.purchaseInvoiceId));
      await this.validateAllocations(trx, existing.supplierId, existing.amount.currency, existing.amount, allocations);

      if (existing.endorsedChequeId) {
        await lockRowsForUpdate(trx, 'payments_received', [existing.endorsedChequeId]);
        await this.assertEndorsable(trx, existing.endorsedChequeId, existing.amount, id);
      } else if (existing.paymentMethod === 'check') {
        await this.assertChequeBank(trx, existing.treasuryId);
      }
      // A cheque leaves the bank when it clears — the balance is checked then (clearCheque).
      if (existing.paymentMethod !== 'check') {
        await this.treasuryMovements.assertCanWithdraw(trx, existing.treasuryId, existing.amount.toMinorUnits());
      }
      // The ledger needs a date: a payment posted without one is dated today (the outbox carries it).
      if (!existing.paymentDate) {
        await trx.updateTable('supplier_payments').set({ payment_date: localIsoDate() }).where('id', '=', id).execute();
      }
      const updated = await this.payments.updateStatus(trx, id, 'posted', 'draft');
      if (!updated) throw statusChanged('SUPPLIER_PAYMENT', id);
      if (updated.paymentMethod === 'check' && !updated.endorsedChequeId) {
        await trx
          .updateTable('supplier_payments')
          .set({ cheque_status: 'issued', cheque_status_date: updated.paymentDate ?? localIsoDate() })
          .where('id', '=', id)
          .execute();
      }

      await this.outboxWriter.write(trx, 'purchases.supplier_payment.posted', {
        schema,
        entityType: 'supplier_payment',
        entityId: id,
        action: 'posted',
        actorUserId,
        metadata: {
          supplierId: updated.supplierId,
          paymentNumber: updated.paymentNumber,
          paymentDate: updated.paymentDate,
          paymentMethod: updated.paymentMethod,
          treasuryId: updated.treasuryId,
          endorsedChequeId: updated.endorsedChequeId,
          amount: { amountMinorUnits: updated.amount.toMinorUnits().toString(), currency: updated.amount.currency },
          allocations: allocationsMetadata(allocations),
        },
        occurredAt: new Date(),
      });

      return { ...updated, allocations, unallocatedAmount: calculateSupplierPaymentUnallocated(updated.amount, allocations) };
    });
  }

  /** Our cheque was paid by the bank: it leaves the treasury it was drawn on from `date`. */
  async clearCheque(
    db: Kysely<TenantDatabase>,
    id: string,
    date: string | null | undefined,
    ctx: { schema: string; actorUserId: string | null },
  ): Promise<void> {
    await withTransaction(db, async (trx) => {
      await lockRowsForUpdate(trx, 'supplier_payments', [id]);
      const row = await trx.selectFrom('supplier_payments').selectAll().where('id', '=', id).executeTakeFirst();
      if (!row) throw entityNotFound('SUPPLIER_PAYMENT', id);
      if (row.status !== 'posted' || row.cheque_status !== 'issued') {
        throw new BusinessRuleError(`Cheque of payment "${row.payment_number}" is not outstanding.`, {
          code: 'CHEQUE.NOT_OUTSTANDING',
          params: { number: row.cheque_number ?? row.payment_number },
        });
      }
      await this.treasuryMovements.assertCanWithdraw(trx, row.treasury_id, BigInt(row.amount_amount));
      const clearedOn = date || localIsoDate();
      await trx.updateTable('supplier_payments').set({ cheque_status: 'cleared', cheque_status_date: clearedOn, updated_at: new Date() }).where('id', '=', id).execute();
      await this.outboxWriter.write(trx, 'purchases.cheque.cleared', {
        schema: ctx.schema,
        entityType: 'supplier_payment',
        entityId: id,
        action: 'cleared',
        actorUserId: ctx.actorUserId,
        occurredAt: new Date(),
        metadata: {
          paymentNumber: row.payment_number,
          chequeNumber: row.cheque_number,
          date: clearedOn,
          paymentDate: row.payment_date ? String(row.payment_date).slice(0, 10) : null,
          treasuryId: row.treasury_id,
          amount: { amountMinorUnits: row.amount_amount, currency: row.amount_currency },
        },
      });
    });
  }

  /** A customer cheque that is in hand, not promised to another payment, for exactly this amount. */
  private async assertEndorsable(db: Kysely<TenantDatabase>, chequeId: string, amount: Money, exceptPaymentId?: string): Promise<void> {
    const cheque = await db
      .selectFrom('payments_received')
      .select(['cheque_status', 'cheque_number', 'amount_amount', 'amount_currency', 'status'])
      .where('id', '=', chequeId)
      .where('payment_method', '=', 'check')
      .executeTakeFirst();
    let taken = db.selectFrom('supplier_payments').select('payment_number').where('endorsed_cheque_id', '=', chequeId).where('status', '!=', 'cancelled');
    if (exceptPaymentId) taken = taken.where('id', '!=', exceptPaymentId);
    const other = await taken.executeTakeFirst();
    if (!cheque || cheque.status !== 'posted' || cheque.cheque_status !== 'in_hand' || other) {
      throw new BusinessRuleError('That customer cheque is not in hand.', {
        code: 'CHEQUE.NOT_IN_HAND',
        params: { number: cheque?.cheque_number ?? '', status: other ? 'endorsed' : (cheque?.cheque_status ?? '') },
      });
    }
    if (BigInt(cheque.amount_amount) !== amount.toMinorUnits() || cheque.amount_currency !== amount.currency) {
      throw new BusinessRuleError('An endorsed cheque is paid over in full: the payment amount must equal the cheque.', {
        code: 'CHEQUE.ENDORSE_AMOUNT_MISMATCH',
        params: { number: cheque.cheque_number ?? '' },
      });
    }
  }

  /** Our own cheque is drawn on a bank account: it needs a bank treasury to clear from. */
  private async assertChequeBank(db: Kysely<TenantDatabase>, treasuryId: string | null): Promise<void> {
    const treasury = treasuryId ? await findTreasury(db, treasuryId) : null;
    if (!treasury || treasury.kind !== 'bank') {
      throw new BusinessRuleError('A cheque we issue must be drawn on a bank account (treasury of kind "bank").', {
        code: 'SUPPLIER_PAYMENT.CHEQUE_NEEDS_BANK',
        params: { treasury: treasury?.name ?? '' },
      });
    }
  }

  /** Applies a posted payment's unallocated remainder to more purchase invoices ('purchases.supplier_payment.allocated'). */
  async allocate(
    db: Kysely<TenantDatabase>,
    id: string,
    schema: string,
    actorUserId: string | null,
    newAllocations: AllocationRequest[],
  ): Promise<SupplierPaymentWithAllocations> {
    if (newAllocations.length === 0) {
      throw new BusinessRuleError('At least one allocation must be given.', {
        code: 'SUPPLIER_PAYMENT.AT_LEAST_ONE_ALLOCATION_REQUIRED',
      });
    }

    return withTransaction(db, async (trx) => {
      // Lock the payment (two allocations of the same remainder) and the invoices (two payments on one balance).
      await lockRowsForUpdate(trx, 'supplier_payments', [id]);
      await lockRowsForUpdate(trx, 'purchase_invoices', newAllocations.map((a) => a.purchaseInvoiceId));
      const existing = await this.payments.findById(trx, id);
      if (!existing) throw entityNotFound('SUPPLIER_PAYMENT', id);
      if (existing.status !== 'posted') {
        throw new BusinessRuleError(
          `Cannot allocate supplier payment "${id}" — only a posted payment can be allocated (status "${existing.status}").`,
          { code: 'SUPPLIER_PAYMENT.NOT_ALLOCATABLE', params: { id, status: existing.status } },
        );
      }
      const existingAllocations = await this.allocations.listBySupplierPaymentId(trx, id);
      const unallocated = calculateSupplierPaymentUnallocated(existing.amount, existingAllocations);
      await this.validateAllocations(trx, existing.supplierId, existing.amount.currency, unallocated, newAllocations);

      const created: SupplierPaymentAllocation[] = [];
      for (const allocation of newAllocations) {
        created.push(await this.allocations.create(trx, id, allocation));
      }

      await this.outboxWriter.write(trx, 'purchases.supplier_payment.allocated', {
        schema,
        entityType: 'supplier_payment',
        entityId: id,
        action: 'allocated',
        actorUserId,
        metadata: { supplierId: existing.supplierId, allocations: allocationsMetadata(created) },
        occurredAt: new Date(),
      });

      const all = [...existingAllocations, ...created];
      return { ...existing, allocations: all, unallocatedAmount: calculateSupplierPaymentUnallocated(existing.amount, all) };
    });
  }

  async cancel(db: Kysely<TenantDatabase>, id: string): Promise<SupplierPayment> {
    return withTransaction(db, async (trx) => {
      await lockRowsForUpdate(trx, 'supplier_payments', [id]);
      const existing = await this.payments.findById(trx, id);
      if (!existing) throw entityNotFound('SUPPLIER_PAYMENT', id);
      if (existing.status !== 'draft') {
        throw new BusinessRuleError(
          `Cannot cancel supplier payment "${id}" from status "${existing.status}" (expected "draft").`,
          { code: 'SUPPLIER_PAYMENT.NOT_CANCELLABLE', params: { id, status: existing.status } },
        );
      }
      const updated = await this.payments.updateStatus(trx, id, 'cancelled', 'draft');
      if (!updated) throw statusChanged('SUPPLIER_PAYMENT', id);
      return updated;
    });
  }

  /** Draft (or already-cancelled draft) only — a posted payment is a ledger fact. */
  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await withTransaction(db, async (trx) => {
      await lockRowsForUpdate(trx, 'supplier_payments', [id]);
      const existing = await this.payments.findById(trx, id);
      if (!existing) throw entityNotFound('SUPPLIER_PAYMENT', id);
      if (existing.status !== 'draft' && existing.status !== 'cancelled') {
        throw new BusinessRuleError(`Supplier payment "${id}" is "${existing.status}" and cannot be deleted.`, {
          code: 'SUPPLIER_PAYMENT.NOT_DELETABLE',
          params: { id, status: existing.status },
        });
      }
      if (!(await this.payments.delete(trx, id))) throw statusChanged('SUPPLIER_PAYMENT', id);
    });
  }
}
