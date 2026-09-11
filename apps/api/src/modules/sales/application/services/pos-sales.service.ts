import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../ports/customer.repository';
import { POS_SESSION_REPOSITORY, type PosSessionRepository } from '../ports/pos-session.repository';
import {
  assertSingleCurrency,
  calculateSalesOrderTotal,
  distributeOrderTotalAcrossLines,
} from '../../domain/sales-order.entity';
import type { PosCheckoutInput, PosCheckoutResult } from '../../domain/pos-sale.entity';
import { BusinessRuleError } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { SalesOrdersService } from './sales-orders.service';
import { DeliveriesService } from './deliveries.service';
import { SalesInvoicesService } from './sales-invoices.service';
import { PaymentsReceivedService } from './payments-received.service';

/**
 * POS Checkout orchestration (CLAUDE.md §10 — step 4, Sales — POS
 * feature, Stage 3; see claude/sales-pos-research.md §4). The last
 * piece of the "why POS is a Sales extension, not a new module"
 * decision: checkout() does not bypass the existing document chain —
 * it drives it, atomically, in one request.
 *
 * Reuses the exact same existing services and methods a human
 * operating the general Sales UI would call one at a time
 * (SalesOrdersService.create/confirm, DeliveriesService.create/
 * confirm, SalesInvoicesService.create/post,
 * PaymentsReceivedService.create/post) — no shortcut logic duplicated
 * here, no bypass of COGS/stock-deduction (wired to Delivery
 * confirmation, not Invoice posting — the "key finding" the research
 * doc flags) or of invoice/payment posting's Outbox-backed financial
 * events.
 *
 * Atomicity: every one of those methods wraps its own body in
 * `withTransaction(db, ...)` (not a raw `db.transaction()` call — see
 * that helper's own comment for why: Kysely 0.29.5 throws if you call
 * `.transaction()` on an already-active `Transaction<DB>`). checkout()
 * opens ONE outer transaction and passes that same `trx` all the way
 * down, so `withTransaction()` detects it's already inside a
 * transaction and runs each step directly against it instead of
 * opening a nested one — the whole checkout commits or rolls back
 * together. This composition was verified against Kysely's actual
 * installed source (node_modules/kysely/dist/kysely.js), not assumed.
 *
 * Pricing: reuses sales-order.entity.ts's calculateSalesOrderTotal()/
 * distributeOrderTotalAcrossLines() rather than inventing its own
 * discount math — a POS sale prices identically to a manually-built
 * Sales Order given the same lines/discounts. The Sales Order is
 * created with each line's own (gross) unitPrice and discount fields
 * (so its own stored numbers are self-consistent and auditable); the
 * Sales Invoice — which has no header-discount concept of its own —
 * is then charged the exact per-line amount distributeOrderTotalAcrossLines()
 * computes, via SalesInvoicesService.create()'s existing per-line
 * unitPrice override, so the invoice (and the revenue it posts to
 * Accounting) reflects the FULL discounted total, not just each line's
 * own line-level discount.
 */
@Injectable()
export class PosSalesService {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(POS_SESSION_REPOSITORY) private readonly posSessions: PosSessionRepository,
    private readonly salesOrders: SalesOrdersService,
    private readonly deliveries: DeliveriesService,
    private readonly salesInvoices: SalesInvoicesService,
    private readonly paymentsReceived: PaymentsReceivedService,
  ) {}

  async checkout(
    db: Kysely<TenantDatabase>,
    posSessionId: string,
    input: PosCheckoutInput,
    schema: string,
    actorUserId: string | null,
  ): Promise<PosCheckoutResult> {
    if (input.lines.length === 0) {
      throw new BusinessRuleError('A checkout must have at least one line.', {
        code: 'POS_SALE.AT_LEAST_ONE_LINE_REQUIRED',
      });
    }
    if (input.tenders.length === 0) {
      throw new BusinessRuleError('A checkout must have at least one tender (payment).', {
        code: 'POS_SALE.AT_LEAST_ONE_TENDER_REQUIRED',
      });
    }

    const session = await this.posSessions.findById(db, posSessionId);
    if (!session) throw entityNotFound('POS_SESSION', posSessionId);
    if (session.status !== 'open') {
      throw new BusinessRuleError(
        `POS session "${posSessionId}" is "${session.status}" — only an open session can check out a sale.`,
        { code: 'POS_SALE.SESSION_NOT_OPEN', params: { id: posSessionId, status: session.status } },
      );
    }
    if (!session.warehouseId) {
      // Guards against a session opened before migration 0064 (application-enforced-required going
      // forward, per PosSessionsService.open() — see that migration's comment for why the column
      // itself stays nullable at the DB level).
      throw new BusinessRuleError(
        `POS session "${posSessionId}" has no warehouse set and cannot check out a sale. Close it and open a new one.`,
        { code: 'POS_SALE.SESSION_MISSING_WAREHOUSE', params: { id: posSessionId } },
      );
    }

    try {
      assertSingleCurrency(input.lines);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BusinessRuleError(message, { code: 'POS_SALE.MULTIPLE_CURRENCIES', params: { reason: message } });
    }

    let totalAmount: Money;
    try {
      totalAmount = calculateSalesOrderTotal(input, input.lines).totalAmount;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BusinessRuleError(message, { code: 'POS_SALE.INVALID_DISCOUNT', params: { reason: message } });
    }

    const tenderedTotal = input.tenders.reduce((sum, tender) => sum.add(tender.amount), Money.zero(totalAmount.currency));
    if (!tenderedTotal.equals(totalAmount)) {
      throw new BusinessRuleError(
        `Tendered amount (${tenderedTotal.toDecimalString()}) does not match the sale total ` +
          `(${totalAmount.toDecimalString()}).`,
        {
          code: 'POS_SALE.TENDERED_TOTAL_MISMATCH',
          params: { tendered: tenderedTotal.toDecimalString(), total: totalAmount.toDecimalString() },
        },
      );
    }

    const customerId = input.customerId ?? (await this.resolveWalkInCustomerId(db));

    return withTransaction(db, async (trx) => {
      const order = await this.salesOrders.create(trx, {
        customerId,
        lines: input.lines.map((line) => ({
          productVariantId: line.productVariantId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountType: line.discountType ?? null,
          discountPercentage: line.discountPercentage ?? null,
          discountFixedAmount: line.discountFixedAmount ?? null,
          notes: line.notes ?? null,
        })),
        discountType: input.discountType ?? null,
        discountPercentage: input.discountPercentage ?? null,
        discountFixedAmount: input.discountFixedAmount ?? null,
        notes: input.notes ?? null,
        customFields: {},
      });
      await this.salesOrders.confirm(trx, order.id);

      const delivery = await this.deliveries.create(trx, {
        salesOrderId: order.id,
        warehouseId: session.warehouseId!,
        lines: order.lines.map((line) => ({
          salesOrderLineId: line.id,
          quantityDelivered: line.quantity,
          notes: null,
        })),
        deliveryDate: null,
        notes: input.notes ?? null,
        customFields: {},
      });
      const confirmedDelivery = await this.deliveries.confirm(trx, delivery.id, schema, actorUserId);

      // Full order total (line + header discount, already combined) split back across the
      // order's own lines — see distributeOrderTotalAcrossLines()'s own comment for why this,
      // and not each line's raw/line-discounted unitPrice, is what the invoice must charge.
      const netLineTotals = distributeOrderTotalAcrossLines(order, order.lines);
      const invoice = await this.salesInvoices.create(
        trx,
        {
          salesOrderId: order.id,
          lines: order.lines.map((line, i) => ({
            salesOrderLineId: line.id,
            quantityInvoiced: line.quantity,
            unitPrice: netLineTotals[i].divideByQuantity(line.quantity),
            notes: null,
          })),
          invoiceDate: null,
          dueDate: null,
          notes: input.notes ?? null,
          customFields: {},
        },
        schema,
        actorUserId,
      );
      const postedInvoice = await this.salesInvoices.post(trx, invoice.id, schema, actorUserId);

      const payments = [];
      for (const tender of input.tenders) {
        const payment = await this.paymentsReceived.create(trx, {
          customerId,
          amount: tender.amount,
          paymentMethod: tender.paymentMethod,
          referenceNumber: tender.referenceNumber ?? null,
          allocations: [{ salesInvoiceId: postedInvoice.id, allocatedAmount: tender.amount }],
          posSessionId: session.id,
        });
        payments.push(await this.paymentsReceived.post(trx, payment.id, schema, actorUserId));
      }

      return { salesOrder: order, delivery: confirmedDelivery, salesInvoice: postedInvoice, payments };
    });
  }

  private async resolveWalkInCustomerId(db: Kysely<TenantDatabase>): Promise<string> {
    const walkIn = await this.customers.findSystemDefault(db);
    if (!walkIn) {
      throw new BusinessRuleError(
        'No Walk-in Customer is configured for this tenant. Run the db:seed-walk-in-customer command, or specify a customerId explicitly.',
        { code: 'POS_SALE.NO_WALK_IN_CUSTOMER' },
      );
    }
    return walkIn.id;
  }
}
