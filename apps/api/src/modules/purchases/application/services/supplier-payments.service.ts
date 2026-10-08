import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { resolvePaymentTreasury } from '../../../../shared/treasury/treasury-reader';
import { TreasuryMovementRegistry } from '../../../../shared/treasury/treasury-movements';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
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
import {
  PURCHASE_INVOICE_LINE_REPOSITORY,
  type PurchaseInvoiceLineRepository,
} from '../ports/purchase-invoice-line.repository';
import { calculatePurchaseInvoiceTotal } from '../../domain/purchase-invoice.entity';
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
 * its total minus other posted payments' allocations; and the allocations
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
    @Inject(PURCHASE_INVOICE_LINE_REPOSITORY) private readonly purchaseInvoiceLines: PurchaseInvoiceLineRepository,
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

  /** The supplier's posted purchase invoices with total / paid (posted payments only) / outstanding. */
  async listOutstandingInvoices(db: Kysely<TenantDatabase>, supplierId: string): Promise<SupplierOutstandingInvoice[]> {
    const invoices = await this.purchaseInvoices.listPostedBySupplierId(db, supplierId);
    const paid = await this.allocations.sumAllocatedAmountByPurchaseInvoiceIds(
      db,
      invoices.map((i) => i.id),
    );
    const result: SupplierOutstandingInvoice[] = [];
    for (const invoice of invoices) {
      const lines = await this.purchaseInvoiceLines.listByPurchaseInvoiceId(db, invoice.id);
      if (lines.length === 0) continue;
      const totalAmount = calculatePurchaseInvoiceTotal(lines);
      const paidAmount = paid[invoice.id] ?? Money.zero(totalAmount.currency);
      result.push({
        purchaseInvoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierInvoiceNumber: invoice.supplierInvoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        totalAmount,
        paidAmount,
        outstandingAmount: totalAmount.subtract(paidAmount),
      });
    }
    return result;
  }

  private async validateAllocations(
    db: Kysely<TenantDatabase>,
    supplierId: string,
    currency: string,
    ceiling: Money,
    allocationInputs: AllocationRequest[],
  ): Promise<void> {
    if (allocationInputs.length === 0) return;

    const invoiceIds = [...new Set(allocationInputs.map((a) => a.purchaseInvoiceId))];
    const alreadyAllocated = await this.allocations.sumAllocatedAmountByPurchaseInvoiceIds(db, invoiceIds);

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

      const lines = await this.purchaseInvoiceLines.listByPurchaseInvoiceId(db, invoiceId);
      const invoiceTotal = calculatePurchaseInvoiceTotal(lines);
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

      const alreadyPaid = alreadyAllocated[invoiceId] ?? Money.zero(invoiceTotal.currency);
      const outstanding = invoiceTotal.subtract(alreadyPaid);
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
    const treasuryId = await resolvePaymentTreasury(db, {
      treasuryId: input.treasuryId,
      paymentMethod: input.paymentMethod,
      currency: input.amount.currency,
    });

    try {
      return await withTransaction(db, async (trx) => {
        const allocated = await this.numberingSequences.allocateNext(trx, 'supplier_payment', null);
        const payment = await this.payments.create(trx, {
          paymentNumber: allocated.formatted,
          supplierId: input.supplierId,
          paymentDate: input.paymentDate ?? null,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber ?? null,
          amount: input.amount,
          treasuryId,
          notes: input.notes ?? null,
          customFields: input.customFields ?? {},
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

  /** The one-way door: status → posted + 'purchases.supplier_payment.posted' outbox row, atomically (§2.7). */
  async post(
    db: Kysely<TenantDatabase>,
    id: string,
    schema: string,
    actorUserId: string | null,
  ): Promise<SupplierPaymentWithAllocations> {
    const existing = await this.payments.findById(db, id);
    if (!existing) throw entityNotFound('SUPPLIER_PAYMENT', id);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot post supplier payment "${id}" from status "${existing.status}" (expected "draft").`,
        { code: 'SUPPLIER_PAYMENT.NOT_POSTABLE', params: { id, status: existing.status } },
      );
    }

    const allocations = await this.allocations.listBySupplierPaymentId(db, id);
    await this.validateAllocations(db, existing.supplierId, existing.amount.currency, existing.amount, allocations);

    return withTransaction(db, async (trx) => {
      await this.treasuryMovements.assertCanWithdraw(trx, existing.treasuryId, existing.amount.toMinorUnits());
      const updated = await this.payments.updateStatus(trx, id, 'posted');
      if (!updated) throw entityNotFound('SUPPLIER_PAYMENT', id);

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
          amount: { amountMinorUnits: updated.amount.toMinorUnits().toString(), currency: updated.amount.currency },
          allocations: allocationsMetadata(allocations),
        },
        occurredAt: new Date(),
      });

      return { ...updated, allocations, unallocatedAmount: calculateSupplierPaymentUnallocated(updated.amount, allocations) };
    });
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

    const existing = await this.payments.findById(db, id);
    if (!existing) throw entityNotFound('SUPPLIER_PAYMENT', id);
    if (existing.status !== 'posted') {
      throw new BusinessRuleError(
        `Cannot allocate supplier payment "${id}" — only a posted payment can be allocated (status "${existing.status}").`,
        { code: 'SUPPLIER_PAYMENT.NOT_ALLOCATABLE', params: { id, status: existing.status } },
      );
    }

    const existingAllocations = await this.allocations.listBySupplierPaymentId(db, id);
    const unallocated = calculateSupplierPaymentUnallocated(existing.amount, existingAllocations);
    await this.validateAllocations(db, existing.supplierId, existing.amount.currency, unallocated, newAllocations);

    return withTransaction(db, async (trx) => {
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
    const existing = await this.payments.findById(db, id);
    if (!existing) throw entityNotFound('SUPPLIER_PAYMENT', id);
    if (existing.status !== 'draft') {
      throw new BusinessRuleError(
        `Cannot cancel supplier payment "${id}" from status "${existing.status}" (expected "draft").`,
        { code: 'SUPPLIER_PAYMENT.NOT_CANCELLABLE', params: { id, status: existing.status } },
      );
    }
    const updated = await this.payments.updateStatus(db, id, 'cancelled');
    if (!updated) throw entityNotFound('SUPPLIER_PAYMENT', id);
    return updated;
  }

  /** Draft (or already-cancelled draft) only — a posted payment is a ledger fact. */
  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.payments.findById(db, id);
    if (!existing) throw entityNotFound('SUPPLIER_PAYMENT', id);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BusinessRuleError(`Supplier payment "${id}" is "${existing.status}" and cannot be deleted.`, {
        code: 'SUPPLIER_PAYMENT.NOT_DELETABLE',
        params: { id, status: existing.status },
      });
    }
    await this.payments.delete(db, id);
  }
}
