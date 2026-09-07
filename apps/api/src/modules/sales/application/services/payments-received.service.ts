import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import {
  PAYMENT_RECEIVED_REPOSITORY,
  type PaymentReceivedRepository,
} from '../ports/payment-received.repository';
import {
  PAYMENT_ALLOCATION_REPOSITORY,
  type PaymentAllocationRepository,
} from '../ports/payment-allocation.repository';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../ports/customer.repository';
import { SALES_ORDER_REPOSITORY, type SalesOrderRepository } from '../ports/sales-order.repository';
import { SALES_INVOICE_REPOSITORY, type SalesInvoiceRepository } from '../ports/sales-invoice.repository';
import {
  SALES_INVOICE_LINE_REPOSITORY,
  type SalesInvoiceLineRepository,
} from '../ports/sales-invoice-line.repository';
import { Money } from '@erp-platform/shared-kernel';
import { calculateSalesInvoiceTotal } from '../../domain/sales-invoice.entity';
import {
  calculateUnallocatedAmount,
  type PaymentReceived,
  type PaymentReceivedWithAllocations,
  type CreatePaymentReceivedInput,
} from '../../domain/payment-received.entity';
import { BusinessRuleError, NotFoundError, isPostgresForeignKeyViolation } from '../errors';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';

/**
 * Payments Received (master doc §10, step 4 — Sales, Stage 6, the last
 * baseline entity in the master document's Sales entity list
 * [مستقر]). See migration 0046's comment for the full design
 * rationale (why this exists in Sales when Purchases has no equivalent,
 * the allocation shape, column naming precedent).
 *
 * Same two-step + Outbox shape as SalesInvoicesService: create()
 * persists a 'draft' payment (with its allocations, if any, created in
 * the same transaction); post() is the one-way door that flips the
 * payment to 'posted' and writes the 'sales.payment_received.posted'
 * outbox record atomically with that status flip (CLAUDE.md §2.7) — a
 * payment reducing what a customer owes is exactly as ledger-worthy as
 * an invoice creating that debt. post() therefore needs `schema` and
 * `actorUserId` as real parameters, same deliberate exception as
 * SalesInvoicesService.post()/PurchaseInvoicesService.post().
 *
 * Allocation validation (create() and post() both re-check, since time
 * passes between the two and another payment could post against the
 * same invoice meanwhile):
 *  - every allocation's sales invoice must exist, be 'posted' (only a
 *    posted invoice is a real receivable), and belong to the same
 *    customer as the payment (via the invoice's sales order).
 *  - every allocation's currency must match both the invoice's total
 *    currency and this payment's own `amount` currency — no
 *    multi-currency conversion logic exists anywhere in this codebase.
 *  - the sum of allocations against one invoice (within this payment,
 *    added to every other *posted* payment's allocations against that
 *    same invoice) must not exceed that invoice's total.
 *  - the sum of every allocation on this payment must not exceed the
 *    payment's own `amount` — a payment can under-allocate (leaving
 *    on-account credit) but never over-allocate.
 *
 * allocate() applies an already-*posted* payment's unallocated
 * remainder to one or more additional sales invoices — closing what
 * was originally a deliberately deferred gap (see
 * claude/sales-module-status.md, Stage 6). Only a posted payment can
 * be allocated further (a draft payment's allocations are still only
 * set at create() time — no update() on the payment header itself,
 * same "cancel/recreate a wrong draft" precedent as every other Sales
 * document). allocate() reuses validateAllocations() with the
 * *unallocated remainder* as the ceiling instead of the full payment
 * amount, and writes its own 'sales.payment_received.allocated' outbox
 * record — no new cash moves, but which invoice's receivable balance
 * is reduced does change, which is still ledger-relevant (CLAUDE.md
 * §2.7).
 */
@Injectable()
export class PaymentsReceivedService {
  constructor(
    @Inject(PAYMENT_RECEIVED_REPOSITORY) private readonly payments: PaymentReceivedRepository,
    @Inject(PAYMENT_ALLOCATION_REPOSITORY) private readonly allocations: PaymentAllocationRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(SALES_ORDER_REPOSITORY) private readonly salesOrders: SalesOrderRepository,
    @Inject(SALES_INVOICE_REPOSITORY) private readonly salesInvoices: SalesInvoiceRepository,
    @Inject(SALES_INVOICE_LINE_REPOSITORY) private readonly salesInvoiceLines: SalesInvoiceLineRepository,
    private readonly numberingSequences: NumberingSequencesService,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<PaymentReceived[]> {
    return this.payments.list(db);
  }

  listByCustomerId(db: Kysely<TenantDatabase>, customerId: string): Promise<PaymentReceived[]> {
    return this.payments.listByCustomerId(db, customerId);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<PaymentReceivedWithAllocations> {
    const payment = await this.payments.findById(db, id);
    if (!payment) throw new NotFoundError(`Payment "${id}" not found.`);
    const allocations = await this.allocations.listByPaymentReceivedId(db, id);
    return { ...payment, allocations, unallocatedAmount: calculateUnallocatedAmount(payment.amount, allocations) };
  }

  /**
   * Validates every allocation against its invoice's outstanding
   * balance and currency, returning the resolved invoice map so
   * create()/post() don't refetch. Shared between create() (checked
   * against what create() is about to persist) and post() (re-checked
   * against what's already persisted, in case time has passed).
   */
  private async validateAllocations(
    db: Kysely<TenantDatabase>,
    customerId: string,
    currency: string,
    ceiling: Money,
    allocationInputs: { salesInvoiceId: string; allocatedAmount: Money }[],
  ): Promise<void> {
    if (allocationInputs.length === 0) return;

    const invoiceIds = [...new Set(allocationInputs.map((a) => a.salesInvoiceId))];
    const alreadyAllocated = await this.allocations.sumAllocatedAmountBySalesInvoiceIds(db, invoiceIds);

    const requestedByInvoice = new Map<string, Money>();
    for (const allocation of allocationInputs) {
      const running = requestedByInvoice.get(allocation.salesInvoiceId);
      requestedByInvoice.set(
        allocation.salesInvoiceId,
        running ? running.add(allocation.allocatedAmount) : allocation.allocatedAmount,
      );
    }

    let totalRequested = Money.zero(currency);
    for (const allocation of allocationInputs) {
      if (allocation.allocatedAmount.currency !== currency) {
        throw new BusinessRuleError(
          `Allocation currency "${allocation.allocatedAmount.currency}" does not match the payment's ` +
            `own currency "${currency}" — this codebase has no multi-currency conversion.`,
        );
      }
      totalRequested = totalRequested.add(allocation.allocatedAmount);
    }
    if (totalRequested.greaterThan(ceiling)) {
      throw new BusinessRuleError(
        `Total allocated amount (${totalRequested.toDecimalString()}) exceeds the available amount to ` +
          `allocate (${ceiling.toDecimalString()}).`,
      );
    }

    for (const invoiceId of invoiceIds) {
      const invoice = await this.salesInvoices.findById(db, invoiceId);
      if (!invoice) throw new NotFoundError(`Sales invoice "${invoiceId}" not found.`);
      if (invoice.status !== 'posted') {
        throw new BusinessRuleError(
          `Sales invoice "${invoiceId}" is "${invoice.status}" — only a posted invoice can receive a payment.`,
        );
      }

      const order = await this.salesOrders.findById(db, invoice.salesOrderId);
      if (!order || order.customerId !== customerId) {
        throw new BusinessRuleError(
          `Sales invoice "${invoiceId}" does not belong to customer "${customerId}".`,
        );
      }

      const lines = await this.salesInvoiceLines.listBySalesInvoiceId(db, invoiceId);
      const invoiceTotal = calculateSalesInvoiceTotal(lines);
      const requested = requestedByInvoice.get(invoiceId)!;
      if (requested.currency !== invoiceTotal.currency) {
        throw new BusinessRuleError(
          `Allocation currency "${requested.currency}" does not match sales invoice "${invoiceId}"'s ` +
            `currency "${invoiceTotal.currency}".`,
        );
      }

      const alreadyPaid = alreadyAllocated[invoiceId] ?? Money.zero(invoiceTotal.currency);
      const outstanding = invoiceTotal.subtract(alreadyPaid);
      if (requested.greaterThan(outstanding)) {
        throw new BusinessRuleError(
          `Cannot allocate ${requested.toDecimalString()} to sales invoice "${invoiceId}" — only ` +
            `${outstanding.toDecimalString()} is still outstanding (total ${invoiceTotal.toDecimalString()}, ` +
            `already paid ${alreadyPaid.toDecimalString()}).`,
        );
      }
    }
  }

  async create(
    db: Kysely<TenantDatabase>,
    input: CreatePaymentReceivedInput,
  ): Promise<PaymentReceivedWithAllocations> {
    const customer = await this.customers.findById(db, input.customerId);
    if (!customer) throw new NotFoundError(`Customer "${input.customerId}" not found.`);

    const allocationInputs = input.allocations ?? [];
    await this.validateAllocations(db, input.customerId, input.amount.currency, input.amount, allocationInputs);

    try {
      return await withTransaction(db, async (trx) => {
        const allocated = await this.numberingSequences.allocateNext(trx, 'payment_received', null);

        const payment = await this.payments.create(trx, {
          paymentNumber: allocated.formatted,
          customerId: input.customerId,
          paymentDate: input.paymentDate ?? null,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber ?? null,
          amount: input.amount,
          notes: input.notes ?? null,
          customFields: input.customFields ?? {},
          posSessionId: input.posSessionId ?? null,
        });

        const createdAllocations = [];
        for (const allocation of allocationInputs) {
          createdAllocations.push(
            await this.allocations.create(trx, payment.id, {
              salesInvoiceId: allocation.salesInvoiceId,
              allocatedAmount: allocation.allocatedAmount,
            }),
          );
        }

        return {
          ...payment,
          allocations: createdAllocations,
          unallocatedAmount: calculateUnallocatedAmount(payment.amount, createdAllocations),
        };
      });
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new NotFoundError('The given customer or sales invoice does not exist.');
      }
      if (err instanceof Error && err.message.includes('No numbering sequence configured')) {
        throw new BusinessRuleError(
          'No numbering sequence configured for payments received yet. ' +
            'Create one for document type "payment_received" via Settings → Numbering Sequences first.',
        );
      }
      throw err;
    }
  }

  /**
   * The one-way door, and the reason this stage needs the (already
   * globally available) Outbox. In one DB transaction: flips the
   * payment to 'posted', then writes the outbox record for
   * 'sales.payment_received.posted' — atomically, via
   * OutboxWriterService, using the SAME `trx`. Nothing is published on
   * the plain Event Bus here; OutboxDispatcherService (shared/outbox/)
   * picks the row up on its own schedule and does that.
   */
  async post(
    db: Kysely<TenantDatabase>,
    id: string,
    schema: string,
    actorUserId: string | null,
  ): Promise<PaymentReceivedWithAllocations> {
    const existing = await this.payments.findById(db, id);
    if (!existing) throw new NotFoundError(`Payment "${id}" not found.`);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot post payment "${id}" from its current status "${existing.status}" (expected "draft").`,
      );
    }

    const allocations = await this.allocations.listByPaymentReceivedId(db, id);
    await this.validateAllocations(
      db,
      existing.customerId,
      existing.amount.currency,
      existing.amount,
      allocations.map((a) => ({ salesInvoiceId: a.salesInvoiceId, allocatedAmount: a.allocatedAmount })),
    );

    return withTransaction(db, async (trx) => {
      const updated = await this.payments.updateStatus(trx, id, 'posted');
      if (!updated) throw new NotFoundError(`Payment "${id}" not found.`);

      await this.outboxWriter.write(trx, 'sales.payment_received.posted', {
        schema,
        entityType: 'payment_received',
        entityId: id,
        action: 'posted',
        actorUserId,
        metadata: {
          customerId: updated.customerId,
          amount: { amountMinorUnits: updated.amount.toMinorUnits().toString(), currency: updated.amount.currency },
          allocations: allocations.map((a) => ({
            salesInvoiceId: a.salesInvoiceId,
            allocatedAmount: {
              amountMinorUnits: a.allocatedAmount.toMinorUnits().toString(),
              currency: a.allocatedAmount.currency,
            },
          })),
        },
        occurredAt: new Date(),
      });

      return { ...updated, allocations, unallocatedAmount: calculateUnallocatedAmount(updated.amount, allocations) };
    });
  }

  /**
   * Applies a *posted* payment's unallocated remainder to one or more
   * additional sales invoices — see this class's comment for why this
   * exists and how it reuses validateAllocations(). Writes its own
   * 'sales.payment_received.allocated' outbox record, atomic with the
   * new payment_allocations rows, so needs `schema`/`actorUserId` as
   * real parameters, same deliberate exception as post().
   */
  async allocate(
    db: Kysely<TenantDatabase>,
    id: string,
    schema: string,
    actorUserId: string | null,
    newAllocations: { salesInvoiceId: string; allocatedAmount: Money }[],
  ): Promise<PaymentReceivedWithAllocations> {
    if (newAllocations.length === 0) {
      throw new BusinessRuleError('At least one allocation must be given.');
    }

    const existing = await this.payments.findById(db, id);
    if (!existing) throw new NotFoundError(`Payment "${id}" not found.`);
    if (existing.status !== 'posted') {
      throw new BusinessRuleError(
        `Cannot allocate payment "${id}" — only a posted payment has a confirmed remainder to allocate ` +
          `(current status "${existing.status}").`,
      );
    }

    const existingAllocations = await this.allocations.listByPaymentReceivedId(db, id);
    const unallocated = calculateUnallocatedAmount(existing.amount, existingAllocations);

    await this.validateAllocations(db, existing.customerId, existing.amount.currency, unallocated, newAllocations);

    return db.transaction().execute(async (trx) => {
      const createdAllocations = [];
      for (const allocation of newAllocations) {
        createdAllocations.push(
          await this.allocations.create(trx, id, {
            salesInvoiceId: allocation.salesInvoiceId,
            allocatedAmount: allocation.allocatedAmount,
          }),
        );
      }

      await this.outboxWriter.write(trx, 'sales.payment_received.allocated', {
        schema,
        entityType: 'payment_received',
        entityId: id,
        action: 'allocated',
        actorUserId,
        metadata: {
          customerId: existing.customerId,
          allocations: createdAllocations.map((a) => ({
            salesInvoiceId: a.salesInvoiceId,
            allocatedAmount: {
              amountMinorUnits: a.allocatedAmount.toMinorUnits().toString(),
              currency: a.allocatedAmount.currency,
            },
          })),
        },
        occurredAt: new Date(),
      });

      const allAllocations = [...existingAllocations, ...createdAllocations];
      return {
        ...existing,
        allocations: allAllocations,
        unallocatedAmount: calculateUnallocatedAmount(existing.amount, allAllocations),
      };
    });
  }

  async cancel(db: Kysely<TenantDatabase>, id: string): Promise<PaymentReceived> {
    const existing = await this.payments.findById(db, id);
    if (!existing) throw new NotFoundError(`Payment "${id}" not found.`);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot cancel payment "${id}" from its current status "${existing.status}" (expected "draft") — ` +
          'a posted payment is a ledger-worthy fact; reversing one needs a real accounting reversal, not a plain cancel.',
      );
    }
    const updated = await this.payments.updateStatus(db, id, 'cancelled');
    if (!updated) throw new NotFoundError(`Payment "${id}" not found.`);
    return updated;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.payments.findById(db, id);
    if (!existing) throw new NotFoundError(`Payment "${id}" not found.`);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Payment "${id}" is "${existing.status}" and cannot be deleted.`);
    }
    await this.payments.delete(db, id);
  }
}
