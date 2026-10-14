import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type {
  ChannelSettlementDto,
  ChannelSettlementLineDto,
  ChannelSettlementSummaryDto,
  ChannelUnpaidOrderDto,
  SaveChannelSettlementDto,
  SettlementMatchDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import { BusinessRuleError } from '../../../../shared/errors/domain-errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { localIsoDate } from '../../../../shared/time/local-date';
import { NumberingSequencesService } from '../../../settings/application/services/numbering-sequences.service';
import { SALES_INVOICE_LINE_REPOSITORY, type SalesInvoiceLineRepository } from '../ports/sales-invoice-line.repository';
import { calculateSalesInvoiceTotal } from '../../domain/sales-invoice.entity';
import { PaymentsReceivedService } from './payments-received.service';

export const CHANNEL_SETTLEMENT_POSTED = 'sales.channel_settlement.posted';

/** Outbox metadata of a posted settlement — Accounting books the fees. */
export interface ChannelSettlementPostedMetadata {
  settlementNumber: string;
  statementDate: string;
  channelName: string;
  treasuryId: string;
  currency: string;
  fees: { categoryId: string | null; categoryName: string | null; categoryAccountId: string | null; amountMinorUnits: string }[];
}

const money = (minor: bigint, currency: string) => ({ amountMinorUnits: minor.toString(), currency });

interface InvoiceState {
  id: string;
  number: string;
  total: bigint;
  outstanding: bigint;
}

/**
 * Marketplace settlements (تسوية منصة) — the weekly statement of a platform
 * that delivers and collects for the seller (Jumia, Noon, Amazon…).
 *
 * Lines are matched to the channel's invoices by the platform order number.
 * Posting, in one transaction:
 *   1. a customer receipt from the platform for (orders − refunds) into the
 *      channel's treasury, allocated to the matched invoices — so "shipped
 *      but not paid yet" is simply the channel's open invoices;
 *   2. the fees it kept leave the same treasury (Sales' treasury movement
 *      source) and an outbox event lets Accounting book them per expense
 *      item.
 * What stays in the channel treasury is the payout; an ordinary transfer
 * moves it to the bank on the day it arrives.
 */
@Injectable()
export class ChannelSettlementsService {
  constructor(
    private readonly numbering: NumberingSequencesService,
    private readonly outbox: OutboxWriterService,
    private readonly payments: PaymentsReceivedService,
    @Inject(SALES_INVOICE_LINE_REPOSITORY) private readonly invoiceLines: SalesInvoiceLineRepository,
  ) {}

  async list(db: Kysely<TenantDatabase>, channelId?: string): Promise<ChannelSettlementSummaryDto[]> {
    let q = db
      .selectFrom('channel_settlements as s')
      .innerJoin('sales_channels as c', 'c.id', 's.sales_channel_id')
      .selectAll('s')
      .select('c.name as channel_name');
    if (channelId) q = q.where('s.sales_channel_id', '=', channelId);
    const rows = await q.orderBy('s.statement_date', 'desc').orderBy('s.created_at', 'desc').limit(500).execute();
    if (rows.length === 0) return [];
    const sums = await db
      .selectFrom('channel_settlement_lines')
      .select(['channel_settlement_id', 'kind', (eb) => eb.fn.sum<string>('amount').as('total')])
      .where('channel_settlement_id', 'in', rows.map((r) => r.id))
      .groupBy(['channel_settlement_id', 'kind'])
      .execute();
    return rows.map((row) => {
      const of = (kind: string) => BigInt(sums.find((s) => s.channel_settlement_id === row.id && s.kind === kind)?.total ?? '0');
      return summary(row, row.channel_name, of('order'), of('refund'), of('fee'));
    });
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<ChannelSettlementDto> {
    const row = await db
      .selectFrom('channel_settlements as s')
      .innerJoin('sales_channels as c', 'c.id', 's.sales_channel_id')
      .selectAll('s')
      .select('c.name as channel_name')
      .where('s.id', '=', id)
      .executeTakeFirst();
    if (!row) throw entityNotFound('CHANNEL_SETTLEMENT', id);
    const lines = await db
      .selectFrom('channel_settlement_lines as l')
      .leftJoin('treasury_categories as tc', 'tc.id', 'l.category_id')
      .selectAll('l')
      .select('tc.name as category_name')
      .where('l.channel_settlement_id', '=', id)
      .orderBy('l.line_number')
      .execute();
    const invoices = await this.invoiceStates(db, lines.map((l) => l.sales_invoice_id).filter((v): v is string => Boolean(v)), row.status === 'posted' ? row.payment_received_id : null);
    const total = (kind: string) => lines.filter((l) => l.kind === kind).reduce((sum, l) => sum + BigInt(l.amount), 0n);
    return {
      ...summary(row, row.channel_name, total('order'), total('refund'), total('fee')),
      lines: lines.map((line): ChannelSettlementLineDto => {
        const invoice = line.sales_invoice_id ? invoices.get(line.sales_invoice_id) : undefined;
        const amount = BigInt(line.amount);
        return {
          id: line.id,
          lineNumber: line.line_number,
          kind: line.kind as ChannelSettlementLineDto['kind'],
          externalReference: line.external_reference,
          description: line.description,
          amount: money(amount, row.currency),
          salesInvoiceId: line.sales_invoice_id,
          salesInvoiceNumber: invoice?.number ?? null,
          invoiceTotal: invoice ? money(invoice.total, row.currency) : null,
          invoiceOutstanding: invoice ? money(invoice.outstanding, row.currency) : null,
          match: matchOf(line.kind, invoice, amount),
          categoryId: line.category_id,
          categoryName: line.category_name,
        };
      }),
    };
  }

  /** Create (no id) or replace a draft: header + lines, each order/refund line matched to the channel's invoice by order number. */
  async save(
    db: Kysely<TenantDatabase>,
    id: string | null,
    input: SaveChannelSettlementDto,
    context: { actorUserId: string | null },
  ): Promise<ChannelSettlementDto> {
    const channel = await this.channel(db, input.salesChannelId);
    const currency = (await db.selectFrom('treasuries').select('currency').where('id', '=', channel.treasury_id!).executeTakeFirstOrThrow()).currency;
    for (const line of input.lines) {
      if (line.kind === 'fee' && !line.categoryId) {
        throw new BusinessRuleError('Every fee line needs its expense item (commission, shipping, ads…).', {
          code: 'CHANNEL_SETTLEMENT.FEE_CATEGORY_REQUIRED',
        });
      }
    }
    // The same platform statement must not be settled twice.
    if (input.statementReference) {
      let dup = db
        .selectFrom('channel_settlements')
        .select('settlement_number')
        .where('sales_channel_id', '=', channel.id)
        .where('statement_reference', '=', input.statementReference)
        .where('status', '<>', 'cancelled');
      if (id) dup = dup.where('id', '<>', id);
      const existing = await dup.executeTakeFirst();
      if (existing) {
        throw new BusinessRuleError(`Statement "${input.statementReference}" is already in settlement ${existing.settlement_number}.`, {
          code: 'CHANNEL_SETTLEMENT.DUPLICATE_STATEMENT',
          params: { reference: input.statementReference, number: existing.settlement_number },
        });
      }
    }
    const refs = [...new Set(input.lines.filter((l) => l.kind !== 'fee' && l.externalReference).map((l) => l.externalReference!))];
    const invoiceByRef = new Map<string, string>();
    if (refs.length > 0) {
      const rows = await db
        .selectFrom('sales_invoices as i')
        .innerJoin('sales_orders as o', 'o.id', 'i.sales_order_id')
        .select(['i.id', 'i.external_reference'])
        .where('i.sales_channel_id', '=', channel.id)
        .where('o.customer_id', '=', channel.customer_id!)
        .where('i.status', '=', 'posted')
        .where('i.external_reference', 'in', refs)
        .orderBy('i.created_at')
        .execute();
      for (const row of rows) if (!invoiceByRef.has(row.external_reference!)) invoiceByRef.set(row.external_reference!, row.id);
    }

    const settlementId = id ?? randomUUID();
    await withTransaction(db, async (trx) => {
      if (id) {
        const existing = await trx.selectFrom('channel_settlements').select('status').where('id', '=', id).forUpdate().executeTakeFirst();
        if (!existing) throw entityNotFound('CHANNEL_SETTLEMENT', id);
        if (existing.status !== 'draft') {
          throw new BusinessRuleError('Only a draft settlement can be edited.', { code: 'CHANNEL_SETTLEMENT.NOT_DRAFT' });
        }
        await trx
          .updateTable('channel_settlements')
          .set({
            sales_channel_id: channel.id,
            statement_date: input.statementDate,
            period_from: input.periodFrom ?? null,
            period_to: input.periodTo ?? null,
            statement_reference: input.statementReference ?? null,
            currency,
            notes: input.notes ?? null,
            updated_at: new Date(),
          })
          .where('id', '=', id)
          .execute();
        await trx.deleteFrom('channel_settlement_lines').where('channel_settlement_id', '=', id).execute();
      } else {
        const number = await this.numbering.allocateNext(trx, 'channel_settlement', null);
        await trx
          .insertInto('channel_settlements')
          .values({
            id: settlementId,
            settlement_number: number.formatted,
            sales_channel_id: channel.id,
            statement_date: input.statementDate,
            period_from: input.periodFrom ?? null,
            period_to: input.periodTo ?? null,
            statement_reference: input.statementReference ?? null,
            currency,
            notes: input.notes ?? null,
            created_by_user_id: context.actorUserId,
          })
          .execute();
      }
      await trx
        .insertInto('channel_settlement_lines')
        .values(
          input.lines.map((line, index) => ({
            id: randomUUID(),
            channel_settlement_id: settlementId,
            line_number: index + 1,
            kind: line.kind,
            external_reference: line.externalReference ?? null,
            description: line.description ?? null,
            amount: line.amountMinorUnits,
            sales_invoice_id: line.kind !== 'fee' && line.externalReference ? (invoiceByRef.get(line.externalReference) ?? null) : null,
            category_id: line.kind === 'fee' ? (line.categoryId ?? null) : null,
          })),
        )
        .execute();
    });
    return this.getById(db, settlementId);
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const row = await db.selectFrom('channel_settlements').select('status').where('id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('CHANNEL_SETTLEMENT', id);
    if (row.status !== 'draft') {
      throw new BusinessRuleError('Only a draft settlement can be deleted.', { code: 'CHANNEL_SETTLEMENT.NOT_DRAFT' });
    }
    await db.deleteFrom('channel_settlements').where('id', '=', id).execute();
  }

  async post(
    db: Kysely<TenantDatabase>,
    id: string,
    context: { schema: string; actorUserId: string | null },
  ): Promise<ChannelSettlementDto> {
    const settlement = await this.getById(db, id);
    if (settlement.status !== 'draft') {
      throw new BusinessRuleError('This settlement is already posted.', { code: 'CHANNEL_SETTLEMENT.NOT_DRAFT' });
    }
    const channel = await this.channel(db, settlement.salesChannelId);
    const currency = settlement.currency;
    const received = BigInt(settlement.ordersTotal.amountMinorUnits) - BigInt(settlement.refundsTotal.amountMinorUnits);
    if (received < 0n) {
      throw new BusinessRuleError('Refunds exceed the paid orders on this statement.', {
        code: 'CHANNEL_SETTLEMENT.REFUNDS_EXCEED_ORDERS',
      });
    }

    // Allocate the receipt to the matched invoices, each up to what is still open on it.
    const allocations: { salesInvoiceId: string; allocatedAmount: Money }[] = [];
    let left = received;
    const openLeft = new Map<string, bigint>();
    for (const line of settlement.lines) {
      if (line.kind !== 'order' || !line.salesInvoiceId || left <= 0n) continue;
      const open = openLeft.get(line.salesInvoiceId) ?? BigInt(line.invoiceOutstanding?.amountMinorUnits ?? '0');
      const amount = [BigInt(line.amount.amountMinorUnits), open, left].reduce((a, b) => (a < b ? a : b));
      if (amount <= 0n) continue;
      openLeft.set(line.salesInvoiceId, open - amount);
      left -= amount;
      allocations.push({ salesInvoiceId: line.salesInvoiceId, allocatedAmount: Money.fromMinorUnits(amount, currency) });
    }

    const feesByCategory = new Map<string, { categoryId: string | null; categoryName: string | null; amount: bigint }>();
    for (const line of settlement.lines) {
      if (line.kind !== 'fee') continue;
      const key = line.categoryId ?? '';
      const entry = feesByCategory.get(key) ?? { categoryId: line.categoryId, categoryName: line.categoryName, amount: 0n };
      entry.amount += BigInt(line.amount.amountMinorUnits);
      feesByCategory.set(key, entry);
    }
    const categoryAccounts = feesByCategory.size
      ? new Map(
          (
            await db
              .selectFrom('treasury_categories')
              .select(['id', 'chart_of_account_id'])
              .where('id', 'in', [...feesByCategory.values()].map((f) => f.categoryId).filter((v): v is string => Boolean(v)))
              .execute()
          ).map((r) => [r.id, r.chart_of_account_id]),
        )
      : new Map<string, string | null>();

    await withTransaction(db, async (trx) => {
      const locked = await trx.selectFrom('channel_settlements').select('status').where('id', '=', id).forUpdate().executeTakeFirstOrThrow();
      if (locked.status !== 'draft') {
        throw new BusinessRuleError('This settlement is already posted.', { code: 'CHANNEL_SETTLEMENT.NOT_DRAFT' });
      }
      let paymentId: string | null = null;
      if (received > 0n) {
        const payment = await this.payments.create(trx, {
          customerId: channel.customer_id!,
          amount: Money.fromMinorUnits(received, currency),
          paymentMethod: 'bank_transfer',
          paymentDate: settlement.statementDate,
          referenceNumber: settlement.statementReference ?? settlement.settlementNumber,
          allocations,
          notes: `تسوية ${channel.name} — ${settlement.settlementNumber}`,
          treasuryId: channel.treasury_id,
        });
        await this.payments.post(trx, payment.id, context.schema, context.actorUserId);
        paymentId = payment.id;
      }
      await trx
        .updateTable('channel_settlements')
        .set({ status: 'posted', payment_received_id: paymentId, posted_at: new Date(), updated_at: new Date() })
        .where('id', '=', id)
        .execute();
      const metadata: ChannelSettlementPostedMetadata = {
        settlementNumber: settlement.settlementNumber,
        statementDate: settlement.statementDate,
        channelName: channel.name,
        treasuryId: channel.treasury_id!,
        currency,
        fees: [...feesByCategory.values()].map((fee) => ({
          categoryId: fee.categoryId,
          categoryName: fee.categoryName,
          categoryAccountId: fee.categoryId ? (categoryAccounts.get(fee.categoryId) ?? null) : null,
          amountMinorUnits: fee.amount.toString(),
        })),
      };
      await this.outbox.write(trx, CHANNEL_SETTLEMENT_POSTED, {
        schema: context.schema,
        entityType: 'channel_settlement',
        entityId: id,
        action: 'posted',
        actorUserId: context.actorUserId,
        occurredAt: new Date(),
        metadata: metadata as unknown as Record<string, unknown>,
      });
    });
    return this.getById(db, id);
  }

  /** The channel's posted invoices the platform hasn't fully paid yet, oldest first. */
  async unpaidOrders(db: Kysely<TenantDatabase>, channelId: string): Promise<ChannelUnpaidOrderDto[]> {
    const rows = await db
      .selectFrom('sales_invoices')
      .select(['id', 'invoice_number', 'external_reference', 'invoice_date', 'created_at'])
      .where('sales_channel_id', '=', channelId)
      .where('status', '=', 'posted')
      .orderBy('invoice_date')
      .orderBy('created_at')
      .limit(2000)
      .execute();
    const states = await this.invoiceStates(db, rows.map((r) => r.id), null);
    const today = localIsoDate();
    const result: ChannelUnpaidOrderDto[] = [];
    for (const row of rows) {
      const state = states.get(row.id);
      if (!state || state.outstanding <= 0n) continue;
      const date = row.invoice_date ?? localIsoDate(row.created_at);
      const currency = await this.invoiceCurrency(db, row.id);
      result.push({
        salesInvoiceId: row.id,
        invoiceNumber: row.invoice_number,
        externalReference: row.external_reference,
        invoiceDate: date,
        ageDays: Math.max(0, Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000)),
        total: money(state.total, currency),
        outstanding: money(state.outstanding, currency),
      });
    }
    return result;
  }

  private async channel(db: Kysely<TenantDatabase>, id: string) {
    const channel = await db.selectFrom('sales_channels').selectAll().where('id', '=', id).executeTakeFirst();
    if (!channel) throw entityNotFound('SALES_CHANNEL', id);
    if (channel.kind !== 'marketplace' || !channel.customer_id || !channel.treasury_id) {
      throw new BusinessRuleError(`Channel "${channel.name}" isn't a marketplace with a customer and a treasury.`, {
        code: 'CHANNEL_SETTLEMENT.CHANNEL_NOT_MARKETPLACE',
        params: { name: channel.name },
      });
    }
    return channel;
  }

  private async invoiceCurrency(db: Kysely<TenantDatabase>, invoiceId: string): Promise<string> {
    const row = await db.selectFrom('sales_invoice_lines').select('unit_price_currency').where('sales_invoice_id', '=', invoiceId).executeTakeFirst();
    return row?.unit_price_currency ?? 'EGP';
  }

  /**
   * Total and outstanding (total − posted receipt allocations) per invoice.
   * `excludePaymentId`: a posted settlement shows what was open BEFORE its own receipt.
   */
  private async invoiceStates(db: Kysely<TenantDatabase>, ids: string[], excludePaymentId: string | null): Promise<Map<string, InvoiceState>> {
    const result = new Map<string, InvoiceState>();
    const unique = [...new Set(ids)];
    if (unique.length === 0) return result;
    const [invoices, paid] = await Promise.all([
      db.selectFrom('sales_invoices').select(['id', 'invoice_number']).where('id', 'in', unique).execute(),
      db
        .selectFrom('payment_allocations as a')
        .innerJoin('payments_received as p', 'p.id', 'a.payment_received_id')
        .select(['a.sales_invoice_id', sql<string>`sum(a.allocated_amount_amount)`.as('paid')])
        .where('p.status', '=', 'posted')
        .where('a.sales_invoice_id', 'in', unique)
        .$if(excludePaymentId !== null, (q) => q.where('p.id', '<>', excludePaymentId!))
        .groupBy('a.sales_invoice_id')
        .execute(),
    ]);
    const paidBy = new Map(paid.map((p) => [p.sales_invoice_id, BigInt(p.paid)]));
    for (const invoice of invoices) {
      const lines = await this.invoiceLines.listBySalesInvoiceId(db, invoice.id);
      const total = lines.length ? calculateSalesInvoiceTotal(lines).toMinorUnits() : 0n;
      result.set(invoice.id, { id: invoice.id, number: invoice.invoice_number, total, outstanding: total - (paidBy.get(invoice.id) ?? 0n) });
    }
    return result;
  }
}

function matchOf(kind: string, invoice: InvoiceState | undefined, amount: bigint): SettlementMatchDto {
  if (kind === 'fee') return 'not_applicable';
  if (!invoice) return 'unmatched';
  if (kind === 'refund') return 'matched';
  if (invoice.outstanding <= 0n) return 'already_paid';
  return amount === invoice.outstanding ? 'matched' : 'amount_mismatch';
}

function summary(
  row: {
    id: string;
    settlement_number: string;
    sales_channel_id: string;
    status: string;
    statement_date: string;
    period_from: string | null;
    period_to: string | null;
    statement_reference: string | null;
    currency: string;
    payment_received_id: string | null;
    notes: string | null;
    created_at: Date;
  },
  channelName: string,
  orders: bigint,
  refunds: bigint,
  fees: bigint,
): ChannelSettlementSummaryDto {
  return {
    id: row.id,
    settlementNumber: row.settlement_number,
    salesChannelId: row.sales_channel_id,
    salesChannelName: channelName,
    status: row.status as ChannelSettlementSummaryDto['status'],
    statementDate: row.statement_date,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    statementReference: row.statement_reference,
    currency: row.currency,
    ordersTotal: money(orders, row.currency),
    refundsTotal: money(refunds, row.currency),
    feesTotal: money(fees, row.currency),
    netPayout: money(orders - refunds - fees, row.currency),
    paymentReceivedId: row.payment_received_id,
    notes: row.notes,
    createdAt: row.created_at,
  };
}
