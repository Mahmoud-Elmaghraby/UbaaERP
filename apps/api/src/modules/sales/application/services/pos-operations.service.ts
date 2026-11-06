import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type {
  HoldPosCartDto,
  PosHeldCartDto,
  PosReturnDto,
  PosReturnResultDto,
  PosSaleForReturnDto,
  PosSaleSummaryDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { lockRowsForUpdate } from '../../../../shared/persistence/row-locks';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { SupervisorApprovalService } from '../../../../shared/auth/supervisor-approval';
import { POS_SESSION_REPOSITORY, type PosSessionRepository } from '../ports/pos-session.repository';
import { calculateSalesInvoiceTotal } from '../../domain/sales-invoice.entity';
import { calculateSalesCreditNoteTotals } from '../../domain/sales-credit-note.entity';
import { groupBy, lineForTotals } from '../../infrastructure/statements/customer-ledger.source';
import { BusinessRuleError } from '../errors';
import { assertSessionUsable } from './pos-rules';
import { SalesReturnsService } from './sales-returns.service';
import { CustomerRefundsService } from './customer-refunds.service';

export interface PosActor {
  schema: string;
  userId: string | null;
  permissions: readonly string[];
}

/**
 * Everything at the till beyond ringing up a sale (migration 0113):
 *  - the shift's receipts (reprint) and a sale looked up by its number;
 *  - a return on a receipt: sales return + its credit note, and — unless the
 *    customer keeps it as credit — the money paid back from the drawer (or
 *    the treasury the card / transfer came from), all in one transaction and
 *    approved by a supervisor;
 *  - sales parked at the till and resumed later.
 * Like checkout, it drives the existing documents rather than bypassing them.
 */
@Injectable()
export class PosOperationsService {
  constructor(
    @Inject(POS_SESSION_REPOSITORY) private readonly sessions: PosSessionRepository,
    private readonly salesReturns: SalesReturnsService,
    private readonly refunds: CustomerRefundsService,
    private readonly approvals: SupervisorApprovalService,
  ) {}

  /** The shift's sales, newest first. */
  async sessionSales(db: Kysely<TenantDatabase>, sessionId: string): Promise<PosSaleSummaryDto[]> {
    const rows = await this.salesQuery(db).where('so.pos_session_id', '=', sessionId).orderBy('si.created_at', 'desc').limit(500).execute();
    return this.summaries(db, rows);
  }

  /** A posted sale by its invoice number, with what can still be returned. */
  async saleForReturn(db: Kysely<TenantDatabase>, invoiceNumber: string): Promise<PosSaleForReturnDto> {
    const row = await this.salesQuery(db).where(sql`lower(si.invoice_number)`, '=', invoiceNumber.trim().toLowerCase()).executeTakeFirst();
    if (!row) throw entityNotFound('SALES_INVOICE', invoiceNumber);
    const [summary] = await this.summaries(db, [row]);
    const delivery = await db
      .selectFrom('deliveries')
      .select('id')
      .where('sales_order_id', '=', row.sales_order_id)
      .where('status', '=', 'confirmed')
      .orderBy('created_at')
      .executeTakeFirst();
    if (!delivery) {
      throw new BusinessRuleError('Nothing of this sale was delivered, so nothing can be returned.', { code: 'POS_RETURN.NOT_DELIVERED' });
    }

    const lines = await db
      .selectFrom('delivery_lines as dl')
      .innerJoin('product_variants as v', 'v.id', 'dl.product_variant_id')
      .innerJoin('products as p', 'p.id', 'v.product_id')
      .select(['dl.id', 'dl.sales_order_line_id', 'dl.product_variant_id', 'dl.quantity_delivered', 'p.name', 'v.sku'])
      .where('dl.delivery_id', '=', delivery.id)
      .orderBy('dl.created_at')
      .execute();
    const returned = await db
      .selectFrom('sales_return_lines as rl')
      .innerJoin('sales_returns as r', 'r.id', 'rl.sales_return_id')
      .select(['rl.delivery_line_id', sql<string>`SUM(rl.quantity_returned)`.as('qty')])
      .where('r.delivery_id', '=', delivery.id)
      .where('r.status', '!=', 'cancelled')
      .groupBy('rl.delivery_line_id')
      .execute();
    const returnedBy = new Map(returned.map((r) => [r.delivery_line_id, Number(r.qty)]));
    const invoiceLines = await db
      .selectFrom('sales_invoice_lines')
      .select(['sales_order_line_id', 'unit_price_amount', 'unit_price_currency', 'quantity_invoiced as quantity', 'net_amount', 'taxes'])
      .where('sales_invoice_id', '=', row.id)
      .execute();
    const invoiceLineBy = new Map(invoiceLines.map((l) => [l.sales_order_line_id, l]));

    return {
      ...summary!,
      deliveryId: delivery.id,
      lines: lines.map((line) => {
        const quantity = Number(line.quantity_delivered);
        const returnedQuantity = returnedBy.get(line.id) ?? 0;
        const invoiceLine = invoiceLineBy.get(line.sales_order_line_id);
        const lineTotal = invoiceLine ? calculateSalesInvoiceTotal([lineForTotals(invoiceLine)]) : Money.zero(summary!.total.currency);
        const invoicedQty = invoiceLine ? Number(invoiceLine.quantity) : 1;
        return {
          deliveryLineId: line.id,
          productVariantId: line.product_variant_id,
          productName: line.name,
          sku: line.sku,
          quantity,
          returnedQuantity,
          returnableQuantity: Math.max(0, quantity - returnedQuantity),
          unitAmount: moneyDto(lineTotal.divideByQuantity(invoicedQty || 1)),
        };
      }),
    };
  }

  async processReturn(db: Kysely<TenantDatabase>, sessionId: string, input: PosReturnDto, actor: PosActor): Promise<PosReturnResultDto> {
    const canSupervise = SupervisorApprovalService.canSupervise(actor.permissions);
    return withTransaction(db, async (trx) => {
      // The drawer can't be counted (closed) while money leaves it.
      await lockRowsForUpdate(trx, 'pos_sessions', [sessionId]);
      const session = await this.sessions.findById(trx, sessionId);
      assertSessionUsable(session, sessionId, actor.userId, canSupervise);

      const sale = await trx
        .selectFrom('deliveries as d')
        .innerJoin('sales_orders as so', 'so.id', 'd.sales_order_id')
        .select(['so.customer_id'])
        .where('d.id', '=', input.deliveryId)
        .executeTakeFirst();
      if (!sale) throw entityNotFound('DELIVERY', input.deliveryId);

      const draft = await this.salesReturns.create(trx, {
        deliveryId: input.deliveryId,
        lines: input.lines.map((line) => ({ deliveryLineId: line.deliveryLineId, quantityReturned: line.quantity, reason: line.reason ?? null })),
        returnDate: null,
        notes: input.notes ?? null,
      });
      await this.approvals.approve(trx, actor.schema, {
        action: 'return',
        pin: input.approvalPin,
        actorUserId: actor.userId,
        actorPermissions: actor.permissions,
        posSessionId: sessionId,
        referenceId: draft.id,
        details: { returnNumber: draft.returnNumber },
      });
      const confirmed = await this.salesReturns.confirm(trx, draft.id, actor.schema, actor.userId);

      const note = await trx
        .selectFrom('sales_credit_notes')
        .select(['id', 'credit_note_number'])
        .where('id', '=', confirmed.creditNoteId)
        .executeTakeFirstOrThrow();
      const noteLines = await trx
        .selectFrom('sales_credit_note_lines')
        .select(['unit_price_amount', 'unit_price_currency', 'quantity', 'net_amount', 'taxes'])
        .where('sales_credit_note_id', '=', note.id)
        .execute();
      const amount = calculateSalesCreditNoteTotals(noteLines.map(lineForTotals)).totalAmount;

      let refund: PosReturnResultDto['refund'] = null;
      if (input.refund && amount.isPositive()) {
        const cash = input.refund.paymentMethod === 'cash';
        if (cash && amount.currency !== session!.openingCashAmount.currency) {
          throw new BusinessRuleError('A cash refund must be in the shift currency.', { code: 'POS_SALE.SESSION_CURRENCY_MISMATCH' });
        }
        refund = await this.refunds.create(
          trx,
          {
            customerId: sale.customer_id,
            amount,
            paymentMethod: input.refund.paymentMethod,
            treasuryId: cash ? session!.treasuryId : (input.refund.treasuryId ?? null),
            salesCreditNoteId: note.id,
            posSessionId: sessionId,
            approvedByUserId: null,
            reference: confirmed.returnNumber,
            notes: input.notes ?? null,
          },
          { schema: actor.schema, actorUserId: actor.userId },
        );
      }

      return {
        salesReturnId: confirmed.id,
        returnNumber: confirmed.returnNumber,
        creditNoteId: note.id,
        creditNoteNumber: note.credit_note_number,
        amount: moneyDto(amount),
        refund,
      };
    });
  }

  // ── held carts ──────────────────────────────────────────────────────────

  async heldCarts(db: Kysely<TenantDatabase>, sessionId: string): Promise<PosHeldCartDto[]> {
    const session = await this.sessions.findById(db, sessionId);
    if (!session) throw entityNotFound('POS_SESSION', sessionId);
    if (!session.warehouseId) return [];
    const rows = await db
      .selectFrom('pos_held_carts as h')
      .leftJoin('customers as c', 'c.id', 'h.customer_id')
      .leftJoin('users as u', 'u.id', 'h.created_by_user_id')
      .selectAll('h')
      .select(['c.name as customer_name', 'u.full_name as user_name'])
      .where('h.warehouse_id', '=', session.warehouseId)
      .orderBy('h.created_at')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      customerId: row.customer_id,
      customerName: row.customer_name,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      total: { amountMinorUnits: row.total_amount, currency: row.currency },
      itemCount: row.item_count,
      createdByName: row.user_name,
      createdAt: row.created_at,
    }));
  }

  async holdCart(db: Kysely<TenantDatabase>, sessionId: string, input: HoldPosCartDto, actor: PosActor): Promise<PosHeldCartDto> {
    const session = await this.sessions.findById(db, sessionId);
    assertSessionUsable(session, sessionId, actor.userId, SupervisorApprovalService.canSupervise(actor.permissions));
    const id = randomUUID();
    await db
      .insertInto('pos_held_carts')
      .values({
        id,
        warehouse_id: session!.warehouseId!,
        pos_session_id: sessionId,
        created_by_user_id: actor.userId,
        label: input.label ?? null,
        customer_id: input.customerId ?? null,
        payload: JSON.stringify(input.payload),
        total_amount: input.total.amountMinorUnits,
        currency: input.total.currency,
        item_count: input.itemCount,
      })
      .execute();
    const carts = await this.heldCarts(db, sessionId);
    return carts.find((c) => c.id === id)!;
  }

  /** Taking a parked sale back (resume) or discarding it — either way it leaves the list, once. */
  async takeHeldCart(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const deleted = await db.deleteFrom('pos_held_carts').where('id', '=', id).executeTakeFirst();
    if (Number(deleted.numDeletedRows) === 0) throw entityNotFound('POS_HELD_CART', id);
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private salesQuery(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('sales_invoices as si')
      .innerJoin('sales_orders as so', 'so.id', 'si.sales_order_id')
      .innerJoin('customers as c', 'c.id', 'so.customer_id')
      .select(['si.id', 'si.invoice_number', 'si.created_at', 'si.sales_order_id', 'so.customer_id', 'c.name as customer_name'])
      .where('si.status', '=', 'posted');
  }

  private async summaries(
    db: Kysely<TenantDatabase>,
    rows: { id: string; invoice_number: string; created_at: Date; sales_order_id: string; customer_id: string; customer_name: string }[],
  ): Promise<PosSaleSummaryDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [lines, tenders, returns] = await Promise.all([
      db
        .selectFrom('sales_invoice_lines')
        .select(['sales_invoice_id', 'unit_price_amount', 'unit_price_currency', 'quantity_invoiced as quantity', 'net_amount', 'taxes'])
        .where('sales_invoice_id', 'in', ids)
        .execute(),
      db
        .selectFrom('payment_allocations as pa')
        .innerJoin('payments_received as p', 'p.id', 'pa.payment_received_id')
        .select(['pa.sales_invoice_id', 'p.payment_method', 'pa.allocated_amount_amount', 'pa.allocated_amount_currency'])
        .where('pa.sales_invoice_id', 'in', ids)
        .where('p.status', '=', 'posted')
        .execute(),
      db
        .selectFrom('sales_returns as r')
        .innerJoin('deliveries as d', 'd.id', 'r.delivery_id')
        .select('d.sales_order_id')
        .where('d.sales_order_id', 'in', rows.map((r) => r.sales_order_id))
        .where('r.status', '=', 'confirmed')
        .execute(),
    ]);
    const linesBy = groupBy(lines, (l) => l.sales_invoice_id);
    const tendersBy = groupBy(tenders, (t) => t.sales_invoice_id);
    const returnedOrders = new Set(returns.map((r) => r.sales_order_id));
    return rows.map((row) => {
      const invoiceLines = linesBy.get(row.id) ?? [];
      const total = invoiceLines.length ? calculateSalesInvoiceTotal(invoiceLines.map(lineForTotals)) : Money.zero('EGP');
      return {
        salesInvoiceId: row.id,
        invoiceNumber: row.invoice_number,
        createdAt: row.created_at,
        customerId: row.customer_id,
        customerName: row.customer_name,
        total: moneyDto(total),
        tenders: (tendersBy.get(row.id) ?? []).map((t) => ({
          paymentMethod: t.payment_method as PosSaleSummaryDto['tenders'][number]['paymentMethod'],
          amount: { amountMinorUnits: String(t.allocated_amount_amount), currency: t.allocated_amount_currency },
        })),
        hasReturns: returnedOrders.has(row.sales_order_id),
      };
    });
  }
}

function moneyDto(money: Money): { amountMinorUnits: string; currency: string } {
  return { amountMinorUnits: money.toMinorUnits().toString(), currency: money.currency };
}
