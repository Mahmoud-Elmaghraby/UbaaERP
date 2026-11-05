import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type {
  InstallmentDueRowDto,
  InstallmentStatusDto,
  PlannedInstallmentDto,
  SalesInvoiceInstallmentScheduleDto,
  SalesInvoiceRegisterRowDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { withTransaction } from '../../../../database/tenant/transaction.util';
import { entityNotFound } from '../../../../shared/errors/entity-errors';
import { localIsoDate } from '../../../../shared/time/local-date';
import { BusinessRuleError } from '../errors';
import {
  applyCollections,
  generateInstallments,
  planSchedule,
  type InstallmentDraft,
} from '../../domain/sales-invoice-installments';
import { SalesRegisterService } from './sales-register.service';

export interface GenerateInstallmentsRequest {
  count: number;
  firstDueDate: string;
  intervalMonths?: number;
  downPaymentMinor?: bigint;
  downPaymentDate?: string;
}

export interface InstallmentsDueFilters {
  fromDate?: string;
  toDate?: string;
  customerId?: string;
  /** 'overdue' | 'due' | 'partially_paid' — default: every open installment. */
  status?: string;
}

const MAX_DUE_ROWS = 2000;

/**
 * Installment schedules (التقسيط) of sales invoices. A collection plan only:
 * no ledger effect, no Outbox event. Each installment's state is computed on
 * read by applying the invoice's collected amount (register: paid + credited)
 * oldest first.
 *
 * Editable = the invoice is draft or posted AND nothing has been collected
 * against it yet (no posted receipt allocation, no credit note applied).
 * Once money is in, the schedule is frozen so collected amounts never shift
 * between installments retroactively.
 */
@Injectable()
export class SalesInvoiceInstallmentsService {
  constructor(private readonly register: SalesRegisterService) {}

  async getSchedule(db: Kysely<TenantDatabase>, invoiceId: string): Promise<SalesInvoiceInstallmentScheduleDto> {
    const money = await this.invoiceMoney(db, invoiceId);
    const rows = await db
      .selectFrom('sales_invoice_installments')
      .select(['id', 'sequence', 'due_date', 'amount_amount', 'notes'])
      .where('sales_invoice_id', '=', invoiceId)
      .orderBy('sequence')
      .execute();
    const collected = BigInt(money.paidMinorUnits) + BigInt(money.creditedMinorUnits);
    const states = applyCollections(
      rows.map((r) => ({ dueDate: r.due_date, amountMinor: BigInt(r.amount_amount) })),
      collected,
      localIsoDate(),
    );
    return {
      salesInvoiceId: invoiceId,
      currency: money.currency,
      totalMinorUnits: money.totalMinorUnits,
      collectedMinorUnits: collected.toString(),
      editable: money.status !== 'cancelled' && collected === 0n,
      installments: rows.map((r, i) => ({
        id: r.id,
        sequence: r.sequence,
        dueDate: r.due_date,
        amountMinorUnits: BigInt(r.amount_amount).toString(),
        notes: r.notes,
        paidMinorUnits: states[i]!.paidMinor.toString(),
        remainingMinorUnits: states[i]!.remainingMinor.toString(),
        status: states[i]!.status,
        overdueDays: states[i]!.overdueDays,
      })),
    };
  }

  /** Replaces the whole schedule ([] removes it). */
  async replace(db: Kysely<TenantDatabase>, invoiceId: string, drafts: InstallmentDraft[]): Promise<SalesInvoiceInstallmentScheduleDto> {
    await withTransaction(db, async (trx) => {
      // Serialize with posting/cancelling and concurrent edits of the same invoice.
      const locked = await trx.selectFrom('sales_invoices').select('id').where('id', '=', invoiceId).forUpdate().executeTakeFirst();
      if (!locked) throw entityNotFound('SALES_INVOICE', invoiceId);
      const money = await this.invoiceMoney(trx, invoiceId);
      this.assertEditable(money);
      const total = BigInt(money.totalMinorUnits);
      const planned = planSchedule(total, drafts);
      await trx.deleteFrom('sales_invoice_installments').where('sales_invoice_id', '=', invoiceId).execute();
      if (planned.length) {
        await trx
          .insertInto('sales_invoice_installments')
          .values(
            planned.map((p) => ({
              sales_invoice_id: invoiceId,
              sequence: p.sequence,
              due_date: p.dueDate,
              amount_amount: p.amountMinor.toString(),
              amount_currency: money.currency,
              notes: p.notes,
            })),
          )
          .execute();
      }
    });
    return this.getSchedule(db, invoiceId);
  }

  /** Equal monthly installments for the invoice total — a preview, nothing is saved. */
  async preview(db: Kysely<TenantDatabase>, invoiceId: string, request: GenerateInstallmentsRequest): Promise<PlannedInstallmentDto[]> {
    const money = await this.invoiceMoney(db, invoiceId);
    return generateInstallments({
      totalMinor: BigInt(money.totalMinorUnits),
      count: request.count,
      firstDueDate: request.firstDueDate,
      intervalMonths: request.intervalMonths,
      downPaymentMinor: request.downPaymentMinor,
      downPaymentDate: request.downPaymentDate,
    }).map((p) => ({ sequence: p.sequence, dueDate: p.dueDate, amountMinorUnits: p.amountMinor.toString(), notes: p.notes }));
  }

  /** Open installments of posted invoices, across customers, due in the period (the "installments due" report). */
  async due(db: Kysely<TenantDatabase>, filters: InstallmentsDueFilters = {}): Promise<InstallmentDueRowDto[]> {
    let query = db
      .selectFrom('sales_invoice_installments as i')
      .innerJoin('sales_invoices as si', 'si.id', 'i.sales_invoice_id')
      .innerJoin('sales_orders as so', 'so.id', 'si.sales_order_id')
      .select(['i.sales_invoice_id', 'si.sales_order_id'])
      .where('si.status', '=', 'posted');
    if (filters.customerId) query = query.where('so.customer_id', '=', filters.customerId);
    if (filters.toDate) query = query.where('i.due_date', '<=', filters.toDate);
    const candidates = await query.distinct().limit(MAX_DUE_ROWS).execute();
    if (candidates.length === 0) return [];

    const invoiceIds = [...new Set(candidates.map((c) => c.sales_invoice_id))];
    const registerRows = await this.register.invoices(db, { salesOrderIds: [...new Set(candidates.map((c) => c.sales_order_id))] });
    const byInvoice = new Map(registerRows.map((r) => [r.id, r]));
    const installments = await db
      .selectFrom('sales_invoice_installments')
      .select(['id', 'sales_invoice_id', 'sequence', 'due_date', 'amount_amount'])
      .where('sales_invoice_id', 'in', invoiceIds)
      .orderBy('sales_invoice_id')
      .orderBy('sequence')
      .execute();
    const grouped = new Map<string, typeof installments>();
    for (const row of installments) {
      const list = grouped.get(row.sales_invoice_id) ?? [];
      list.push(row);
      grouped.set(row.sales_invoice_id, list);
    }

    const today = localIsoDate();
    const wanted = filters.status as InstallmentStatusDto | undefined;
    const result: InstallmentDueRowDto[] = [];
    for (const [invoiceId, list] of grouped) {
      const invoice = byInvoice.get(invoiceId);
      if (!invoice) continue;
      const collected = BigInt(invoice.paidMinorUnits) + BigInt(invoice.creditedMinorUnits);
      const states = applyCollections(list.map((r) => ({ dueDate: r.due_date, amountMinor: BigInt(r.amount_amount) })), collected, today);
      list.forEach((row, index) => {
        const state = states[index]!;
        if (state.status === 'paid') return;
        if (wanted && state.status !== wanted) return;
        if (filters.fromDate && row.due_date < filters.fromDate) return;
        if (filters.toDate && row.due_date > filters.toDate) return;
        result.push({
          id: row.id,
          salesInvoiceId: invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          customerId: invoice.customerId,
          customerName: invoice.customerName,
          sequence: row.sequence,
          installmentsCount: list.length,
          dueDate: row.due_date,
          currency: invoice.currency,
          amountMinorUnits: BigInt(row.amount_amount).toString(),
          paidMinorUnits: state.paidMinor.toString(),
          remainingMinorUnits: state.remainingMinor.toString(),
          status: state.status,
          overdueDays: state.overdueDays,
        });
      });
    }
    return result.sort((a, b) => (a.dueDate === b.dueDate ? a.invoiceNumber.localeCompare(b.invoiceNumber) : a.dueDate < b.dueDate ? -1 : 1));
  }

  private assertEditable(money: SalesInvoiceRegisterRowDto): void {
    if (money.status === 'cancelled') {
      throw new BusinessRuleError('A cancelled invoice cannot get an installment schedule.', {
        code: 'SALES_INVOICE_INSTALLMENTS.INVOICE_CANCELLED',
      });
    }
    if (BigInt(money.paidMinorUnits) + BigInt(money.creditedMinorUnits) > 0n) {
      throw new BusinessRuleError('Money was already collected against this invoice; the schedule is locked.', {
        code: 'SALES_INVOICE_INSTALLMENTS.ALREADY_COLLECTED',
      });
    }
  }

  /** The invoice's register row (total, paid, credited) — all of its order's invoices, so credits spread correctly. */
  private async invoiceMoney(db: Kysely<TenantDatabase>, invoiceId: string): Promise<SalesInvoiceRegisterRowDto> {
    const invoice = await db.selectFrom('sales_invoices').select('sales_order_id').where('id', '=', invoiceId).executeTakeFirst();
    if (!invoice) throw entityNotFound('SALES_INVOICE', invoiceId);
    const rows = await this.register.invoices(db, { salesOrderIds: [invoice.sales_order_id] });
    const row = rows.find((r) => r.id === invoiceId);
    if (!row) throw entityNotFound('SALES_INVOICE', invoiceId);
    return row;
  }
}
