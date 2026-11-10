import { Inject, Injectable } from '@nestjs/common';
import { CASH_ROUNDING_STEPS, type CashRounding } from '@erp-platform/contracts';
import { AppSettingsRepository } from '../../../../shared/app-settings/app-settings.repository';
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
import { isPostgresUniqueViolation, BusinessRuleError } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { lockRowsForUpdate } from '../../../../shared/persistence/row-locks';
import { assertSessionUsable, deepestDiscountPercent, settleTenders } from './pos-rules';
import { SupervisorApprovalService } from '../../../../shared/auth/supervisor-approval';
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
    private readonly approvals: SupervisorApprovalService,
    private readonly settings: AppSettingsRepository,
  ) {}

  async checkout(
    db: Kysely<TenantDatabase>,
    posSessionId: string,
    input: PosCheckoutInput,
    schema: string,
    actorUserId: string | null,
    options: { canSupervise?: boolean; permissions?: readonly string[] } = {},
  ): Promise<PosCheckoutResult> {
    if (input.lines.length === 0) {
      throw new BusinessRuleError('A checkout must have at least one line.', {
        code: 'POS_SALE.AT_LEAST_ONE_LINE_REQUIRED',
      });
    }
    if (input.checkoutId) {
      const done = await this.findCheckout(db, input.checkoutId);
      if (done) return done;
    }

    const session = await this.posSessions.findById(db, posSessionId);
    if (!session) throw entityNotFound('POS_SESSION', posSessionId);
    assertSessionUsable(session, posSessionId, actorUserId, options.canSupervise ?? false);
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
    const sessionCurrency = session.openingCashAmount.currency;
    if (
      input.lines.some((line) => line.unitPrice.currency !== sessionCurrency) ||
      input.tenders.some((tender) => tender.amount.currency !== sessionCurrency)
    ) {
      throw new BusinessRuleError(`Every price and payment must be in the session currency ${sessionCurrency}.`, {
        code: 'POS_SALE.SESSION_CURRENCY_MISMATCH',
        params: { currency: sessionCurrency },
      });
    }

    let totalAmount: Money;
    try {
      totalAmount = calculateSalesOrderTotal(input, input.lines).totalAmount;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BusinessRuleError(message, { code: 'POS_SALE.INVALID_DISCOUNT', params: { reason: message } });
    }

    const { tenders, change } = settleTenders(input.tenders, totalAmount);

    const customerId = input.customerId ?? (await this.resolveWalkInCustomerId(db));

    try {
      return await withTransaction(db, async (trx) => {
        // The session can't be closed (or change hands) while this sale lands in it.
        await lockRowsForUpdate(trx, 'pos_sessions', [session.id]);
        const current = await this.posSessions.findById(trx, session.id);
        assertSessionUsable(current, posSessionId, actorUserId, options.canSupervise ?? false);

        // A discount deeper than the cashier's limit needs a supervisor.
        // A sale discount smaller than the cash-rounding step is the rounding itself, not a cashier's discount.
        const step = CASH_ROUNDING_STEPS[(await this.settings.get(trx, 'pos.cashRounding')) as CashRounding];
        const roundingOnly =
          step > 0 && input.discountType === 'fixed' && input.discountFixedAmount != null && Number(input.discountFixedAmount.toMinorUnits()) < step * 100;
        const discount = deepestDiscountPercent(roundingOnly ? { ...input, discountType: null, discountFixedAmount: null } : input);
        if (discount > 0) {
          const limit = await this.settings.get(trx, 'pos.maxDiscountPercent');
          if (limit !== null && discount > limit + 0.005) {
            await this.approvals.approve(trx, schema, {
              action: 'discount',
              pin: input.approvalPin,
              actorUserId,
              actorPermissions: options.permissions ?? [],
              posSessionId: session.id,
              details: { discountPercent: Math.round(discount * 100) / 100, limitPercent: limit },
            });
          }
        }

        const order = await this.salesOrders.create(
          trx,
          {
            customerId,
            lines: input.lines.map((line) => ({
              productVariantId: line.productVariantId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountType: line.discountType ?? null,
              discountPercentage: line.discountPercentage ?? null,
              discountFixedAmount: line.discountFixedAmount ?? null,
              notes: line.notes ?? null,
              unitOfMeasureId: line.unitOfMeasureId ?? null,
            })),
            discountType: input.discountType ?? null,
            discountPercentage: input.discountPercentage ?? null,
            discountFixedAmount: input.discountFixedAmount ?? null,
            // POS sales carry no sales rep.
            salesRepId: null,
            notes: input.notes ?? null,
            customFields: {},
          },
          schema,
        );
        await this.salesOrders.confirm(trx, order.id);
        await trx
          .updateTable('sales_orders')
          .set({ pos_session_id: session.id, ...(input.checkoutId ? { pos_checkout_id: input.checkoutId } : {}) })
          .where('id', '=', order.id)
          .execute();

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
              lineAmount: netLineTotals[i],
              notes: null,
            })),
            // Shelf prices include VAT (Egyptian retail): the invoice total stays exactly
            // the tendered total, and VAT is backed out of it line by line.
            pricesIncludeTax: true,
            applyCustomerWithholding: false,
            invoiceDate: null,
            dueDate: null,
            salesRepId: null,
            notes: input.notes ?? null,
            customFields: {},
          },
          schema,
        );
        const postedInvoice = await this.salesInvoices.post(trx, invoice.id, schema, actorUserId);

        const payments = [];
        for (const tender of tenders) {
          const payment = await this.paymentsReceived.create(trx, {
            customerId,
            amount: tender.amount,
            paymentMethod: tender.paymentMethod,
            referenceNumber: tender.referenceNumber ?? null,
            allocations: [{ salesInvoiceId: postedInvoice.id, allocatedAmount: tender.amount }],
            posSessionId: session.id,
            // Cash goes into the session's cash box (it is counted at closing); any other
            // tender goes to the treasury the cashier picked (bank, e-wallet…).
            treasuryId: tender.paymentMethod === 'cash' ? session.treasuryId : (tender.treasuryId ?? null),
          });
          payments.push(await this.paymentsReceived.post(trx, payment.id, schema, actorUserId));
        }

        return { salesOrder: order, delivery: confirmedDelivery, salesInvoice: postedInvoice, payments, changeAmount: change };
      });
    } catch (err) {
      // The same sale sent twice at once: the second one returns the first.
      if (input.checkoutId && isPostgresUniqueViolation(err)) {
        const done = await this.findCheckout(db, input.checkoutId);
        if (done) return done;
      }
      throw err;
    }
  }

  /** A sale already made for this checkout id, rebuilt for the receipt (change is not known again: 0). */
  private async findCheckout(db: Kysely<TenantDatabase>, checkoutId: string): Promise<PosCheckoutResult | null> {
    const order = await db.selectFrom('sales_orders').select('id').where('pos_checkout_id', '=', checkoutId).executeTakeFirst();
    if (!order) return null;
    const [delivery, invoice] = await Promise.all([
      db.selectFrom('deliveries').select('id').where('sales_order_id', '=', order.id).where('status', '=', 'confirmed').executeTakeFirst(),
      db.selectFrom('sales_invoices').select('id').where('sales_order_id', '=', order.id).where('status', '=', 'posted').executeTakeFirst(),
    ]);
    if (!delivery || !invoice) return null;
    const paymentIds = await db
      .selectFrom('payment_allocations')
      .select('payment_received_id')
      .where('sales_invoice_id', '=', invoice.id)
      .execute();
    const salesOrder = await this.salesOrders.getById(db, order.id);
    return {
      salesOrder,
      delivery: await this.deliveries.getById(db, delivery.id),
      salesInvoice: await this.salesInvoices.getById(db, invoice.id),
      payments: await Promise.all(paymentIds.map((row) => this.paymentsReceived.getById(db, row.payment_received_id))),
      changeAmount: Money.zero(salesOrder.lines[0]?.unitPrice.currency ?? 'EGP'),
    };
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

