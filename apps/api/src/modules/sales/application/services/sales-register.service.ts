import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { CustomerAccountSummaryDto, PaymentReceivedRegisterRowDto, SalesInvoiceRegisterRowDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { localIsoDate } from '../../../../shared/time/local-date';
import { addDays } from '../../../../shared/statements/account-statement';
import { calculateSalesInvoiceTotal } from '../../domain/sales-invoice.entity';
import { calculateSalesCreditNoteTotals } from '../../domain/sales-credit-note.entity';
import { earliestUnpaidDueDate } from '../../domain/sales-invoice-installments';
import { CustomerLedgerSource, groupBy, lineForTotals } from '../../infrastructure/statements/customer-ledger.source';

export interface InvoiceRegisterFilters {
  customerId?: string;
  status?: string;
  /** Posted invoices with something still to collect. */
  openOnly?: boolean;
  fromDate?: string;
  toDate?: string;
  /** Only these orders' invoices (all of an order's invoices, so credit notes spread the same way). */
  salesOrderIds?: string[];
  /** Invoices of this sales rep (migration 0110). */
  salesRepId?: string;
}

const MAX_ROWS = 2000;

/**
 * Read model for sales screens: invoices with customer and money state (paid,
 * credited, outstanding, overdue) and a customer's account summary. Computed
 * on read from the documents — the same sources as the customer statement.
 */
@Injectable()
export class SalesRegisterService {
  constructor(private readonly ledger: CustomerLedgerSource) {}

  async invoices(db: Kysely<TenantDatabase>, filters: InvoiceRegisterFilters = {}): Promise<SalesInvoiceRegisterRowDto[]> {
    let query = db
      .selectFrom('sales_invoices as si')
      .innerJoin('sales_orders as so', 'so.id', 'si.sales_order_id')
      .innerJoin('customers as c', 'c.id', 'so.customer_id')
      .leftJoin('sales_reps as rep', 'rep.id', 'si.sales_rep_id')
      .select([
        'si.id',
        'si.invoice_number',
        'si.sales_rep_id',
        'rep.name as sales_rep_name',
        'si.status',
        'si.invoice_date',
        'si.due_date',
        'si.sales_order_id',
        'si.created_at',
        'so.customer_id',
        'c.name as customer_name',
        'c.payment_terms_days',
      ]);
    if (filters.customerId) query = query.where('so.customer_id', '=', filters.customerId);
    if (filters.status) query = query.where('si.status', '=', filters.status);
    if (filters.salesRepId) query = query.where('si.sales_rep_id', '=', filters.salesRepId);
    if (filters.openOnly) query = query.where('si.status', '=', 'posted');
    if (filters.fromDate) query = query.where(sql<string>`COALESCE(si.invoice_date, si.created_at::date)`, '>=', filters.fromDate);
    if (filters.toDate) query = query.where(sql<string>`COALESCE(si.invoice_date, si.created_at::date)`, '<=', filters.toDate);
    if (filters.salesOrderIds) {
      if (filters.salesOrderIds.length === 0) return [];
      query = query.where('si.sales_order_id', 'in', filters.salesOrderIds);
    }
    const rows = await query.orderBy('si.created_at', 'desc').limit(MAX_ROWS).execute();
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    const lines = await db
      .selectFrom('sales_invoice_lines')
      .select(['sales_invoice_id', 'unit_price_amount', 'unit_price_currency', 'quantity_invoiced as quantity', 'net_amount', 'taxes'])
      .where('sales_invoice_id', 'in', ids)
      .execute();
    const linesByInvoice = groupBy(lines, (l) => l.sales_invoice_id);

    const paidRows = await db
      .selectFrom('payment_allocations as pa')
      .innerJoin('payments_received as p', 'p.id', 'pa.payment_received_id')
      .select(['pa.sales_invoice_id', sql<string>`SUM(pa.allocated_amount_amount)`.as('paid')])
      .where('p.status', '=', 'posted')
      .where('pa.sales_invoice_id', 'in', ids)
      .groupBy('pa.sales_invoice_id')
      .execute();
    const paid = new Map(paidRows.map((r) => [r.sales_invoice_id, BigInt(String(r.paid).split('.')[0]!)]));

    // Installment schedules (migration 0111): the due date is the earliest unpaid installment's.
    const installmentRows = await db
      .selectFrom('sales_invoice_installments')
      .select(['sales_invoice_id', 'due_date', 'amount_amount'])
      .where('sales_invoice_id', 'in', ids)
      .orderBy('sequence')
      .execute();
    const installmentsByInvoice = groupBy(installmentRows, (r) => r.sales_invoice_id);

    const credited = await this.creditsByOrder(db, [...new Set(rows.map((r) => r.sales_order_id))]);
    const today = localIsoDate();

    // Credit notes are per order: spread over that order's posted invoices, oldest first.
    const creditLeft = new Map(credited);
    const ordered = [...rows].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    const result = new Map<string, SalesInvoiceRegisterRowDto>();
    for (const row of ordered) {
      const invoiceLines = linesByInvoice.get(row.id) ?? [];
      const total = invoiceLines.length ? calculateSalesInvoiceTotal(invoiceLines.map(lineForTotals)) : null;
      const totalMinor = total?.toMinorUnits() ?? 0n;
      const paidMinor = paid.get(row.id) ?? 0n;
      let creditedMinor = 0n;
      if (row.status === 'posted') {
        const available = creditLeft.get(row.sales_order_id) ?? 0n;
        creditedMinor = [available, totalMinor - paidMinor].reduce((a, b) => (a < b ? a : b));
        if (creditedMinor < 0n) creditedMinor = 0n;
        creditLeft.set(row.sales_order_id, available - creditedMinor);
      }
      const outstanding = row.status === 'posted' ? totalMinor - paidMinor - creditedMinor : 0n;
      const date = row.invoice_date ?? localIsoDate(row.created_at);
      const schedule = (installmentsByInvoice.get(row.id) ?? []).map((i) => ({ dueDate: i.due_date, amountMinor: BigInt(i.amount_amount) }));
      const termsDueDate = row.due_date ?? (row.payment_terms_days ? addDays(date, row.payment_terms_days) : row.status === 'posted' ? date : null);
      const dueDate = schedule.length ? (earliestUnpaidDueDate(schedule, paidMinor + creditedMinor) ?? schedule.at(-1)!.dueDate) : termsDueDate;
      const overdueDays = outstanding > 0n && dueDate && dueDate < today ? Math.round((Date.parse(today) - Date.parse(dueDate)) / 86_400_000) : 0;
      result.set(row.id, {
        id: row.id,
        invoiceNumber: row.invoice_number,
        status: row.status as SalesInvoiceRegisterRowDto['status'],
        invoiceDate: row.invoice_date,
        dueDate,
        customerId: row.customer_id,
        customerName: row.customer_name,
        salesRepId: row.sales_rep_id,
        salesRepName: row.sales_rep_name,
        salesOrderId: row.sales_order_id,
        currency: total?.currency ?? '',
        totalMinorUnits: totalMinor.toString(),
        paidMinorUnits: paidMinor.toString(),
        creditedMinorUnits: creditedMinor.toString(),
        outstandingMinorUnits: (outstanding < 0n ? 0n : outstanding).toString(),
        overdueDays,
        installmentsCount: schedule.length,
        createdAt: row.created_at,
      });
    }
    const list = rows.map((r) => result.get(r.id)!);
    return filters.openOnly ? list.filter((r) => BigInt(r.outstandingMinorUnits) > 0n) : list;
  }

  /** Payments with customer name and allocated / unallocated amounts (optionally only those applied to one invoice). */
  async payments(
    db: Kysely<TenantDatabase>,
    filters: { customerId?: string; salesInvoiceId?: string; status?: string } = {},
  ): Promise<PaymentReceivedRegisterRowDto[]> {
    let query = db
      .selectFrom('payments_received as p')
      .innerJoin('customers as c', 'c.id', 'p.customer_id')
      .select([
        'p.id',
        'p.payment_number',
        'p.status',
        'p.payment_date',
        'p.payment_method',
        'p.reference_number',
        'p.customer_id',
        'p.amount_amount',
        'p.amount_currency',
        'p.created_at',
        'c.name as customer_name',
        (eb) =>
          eb
            .selectFrom('payment_allocations as pa')
            .select(sql<string>`COALESCE(SUM(pa.allocated_amount_amount), 0)`.as('a'))
            .whereRef('pa.payment_received_id', '=', 'p.id')
            .as('allocated'),
      ]);
    if (filters.customerId) query = query.where('p.customer_id', '=', filters.customerId);
    if (filters.status) query = query.where('p.status', '=', filters.status);
    const invoiceId = filters.salesInvoiceId;
    if (invoiceId) {
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('payment_allocations as pi')
            .select('pi.id')
            .whereRef('pi.payment_received_id', '=', 'p.id')
            .where('pi.sales_invoice_id', '=', invoiceId),
        ),
      );
    }
    const rows = await query.orderBy('p.created_at', 'desc').limit(MAX_ROWS).execute();
    const toInvoice = new Map<string, bigint>();
    if (invoiceId && rows.length > 0) {
      const applied = await db
        .selectFrom('payment_allocations')
        .select(['payment_received_id', sql<string>`SUM(allocated_amount_amount)`.as('a')])
        .where('sales_invoice_id', '=', invoiceId)
        .where('payment_received_id', 'in', rows.map((r) => r.id))
        .groupBy('payment_received_id')
        .execute();
      for (const r of applied) toInvoice.set(r.payment_received_id, BigInt(String(r.a).split('.')[0]!));
    }
    return rows.map((row) => {
      const amount = BigInt(row.amount_amount);
      const allocated = BigInt(String(row.allocated ?? '0').split('.')[0]!);
      return {
        id: row.id,
        paymentNumber: row.payment_number,
        status: row.status as PaymentReceivedRegisterRowDto['status'],
        paymentDate: row.payment_date,
        paymentMethod: row.payment_method as PaymentReceivedRegisterRowDto['paymentMethod'],
        referenceNumber: row.reference_number,
        customerId: row.customer_id,
        customerName: row.customer_name,
        currency: row.amount_currency,
        amountMinorUnits: amount.toString(),
        allocatedMinorUnits: allocated.toString(),
        unallocatedMinorUnits: (amount - allocated).toString(),
        allocatedToInvoiceMinorUnits: invoiceId ? (toInvoice.get(row.id) ?? 0n).toString() : null,
        createdAt: row.created_at,
      };
    });
  }

  async customerSummary(db: Kysely<TenantDatabase>, customerId: string): Promise<CustomerAccountSummaryDto> {
    const customer = await db.selectFrom('customers').select('default_currency').where('id', '=', customerId).executeTakeFirstOrThrow();
    const entries = await this.ledger.listEntries(db, customerId);
    const balance = entries.reduce((sum, e) => sum + e.amountMinor, 0n);
    const invoices = await this.invoices(db, { customerId, openOnly: true });
    const open = invoices.reduce((sum, r) => sum + BigInt(r.outstandingMinorUnits), 0n);
    const buckets = { current: 0n, '1_30': 0n, '31_60': 0n, '61_90': 0n, '90_plus': 0n };
    for (const row of invoices) {
      const amount = BigInt(row.outstandingMinorUnits);
      const d = row.overdueDays;
      const key = d <= 0 ? 'current' : d <= 30 ? '1_30' : d <= 60 ? '31_60' : d <= 90 ? '61_90' : '90_plus';
      buckets[key] += amount;
    }
    const overdue = open - buckets.current;
    const yearStart = `${localIsoDate().slice(0, 4)}-01-01`;
    const sales = entries.filter((e) => e.kind === 'sales_invoice' && e.date >= yearStart).reduce((sum, e) => sum + e.amountMinor, 0n);
    const lastOf = (kind: string) => entries.filter((e) => e.kind === kind).map((e) => e.date).sort().at(-1) ?? null;
    // Per payment: its amount minus what is allocated.
    const perPayment = await db
      .selectFrom('payments_received as p')
      .select([
        'p.amount_amount',
        (eb) =>
          eb
            .selectFrom('payment_allocations as pa')
            .select(sql<string>`COALESCE(SUM(pa.allocated_amount_amount), 0)`.as('a'))
            .whereRef('pa.payment_received_id', '=', 'p.id')
            .as('allocated'),
      ])
      .where('p.customer_id', '=', customerId)
      .where('p.status', '=', 'posted')
      .execute();
    const unallocatedMinor = perPayment.reduce((sum, p) => sum + BigInt(p.amount_amount) - BigInt(String(p.allocated ?? '0').split('.')[0]!), 0n);
    return {
      customerId,
      currency: invoices[0]?.currency || customer.default_currency,
      balanceMinorUnits: balance.toString(),
      openInvoicesMinorUnits: open.toString(),
      overdueMinorUnits: overdue.toString(),
      unallocatedPaymentsMinorUnits: unallocatedMinor.toString(),
      aging: (Object.keys(buckets) as Array<keyof typeof buckets>).map((bucket) => ({ bucket, amountMinorUnits: buckets[bucket].toString() })),
      lastInvoiceDate: lastOf('sales_invoice'),
      lastPaymentDate: lastOf('payment_received'),
      salesThisYearMinorUnits: sales.toString(),
    };
  }

  /** Credit notes per sales order (through return → delivery → order). */
  private async creditsByOrder(db: Kysely<TenantDatabase>, orderIds: string[]): Promise<Map<string, bigint>> {
    if (orderIds.length === 0) return new Map();
    const notes = await db
      .selectFrom('sales_credit_notes as cn')
      .innerJoin('sales_returns as r', 'r.id', 'cn.sales_return_id')
      .innerJoin('deliveries as d', 'd.id', 'r.delivery_id')
      .select(['cn.id', 'd.sales_order_id'])
      .where('d.sales_order_id', 'in', orderIds)
      .execute();
    if (notes.length === 0) return new Map();
    const lines = await db
      .selectFrom('sales_credit_note_lines')
      .select(['sales_credit_note_id', 'unit_price_amount', 'unit_price_currency', 'quantity', 'net_amount', 'taxes'])
      .where('sales_credit_note_id', 'in', notes.map((n) => n.id))
      .execute();
    const byNote = groupBy(lines, (l) => l.sales_credit_note_id);
    const result = new Map<string, bigint>();
    for (const note of notes) {
      const noteLines = byNote.get(note.id);
      if (!noteLines?.length) continue;
      const total = calculateSalesCreditNoteTotals(noteLines.map(lineForTotals)).totalAmount.toMinorUnits();
      result.set(note.sales_order_id, (result.get(note.sales_order_id) ?? 0n) + total);
    }
    return result;
  }
}
