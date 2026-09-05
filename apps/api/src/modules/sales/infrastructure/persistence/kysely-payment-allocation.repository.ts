import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { PaymentAllocationsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  PaymentAllocationRepository,
  CreatePaymentAllocationRow,
} from '../../application/ports/payment-allocation.repository';
import type { PaymentAllocation } from '../../domain/payment-received.entity';

function toDomain(row: Selectable<PaymentAllocationsTable>): PaymentAllocation {
  return {
    id: row.id,
    paymentReceivedId: row.payment_received_id,
    salesInvoiceId: row.sales_invoice_id,
    allocatedAmount: Money.fromMinorUnits(BigInt(row.allocated_amount_amount), row.allocated_amount_currency),
    createdAt: row.created_at,
  };
}

export class KyselyPaymentAllocationRepository implements PaymentAllocationRepository {
  async listByPaymentReceivedId(
    db: Kysely<TenantDatabase>,
    paymentReceivedId: string,
  ): Promise<PaymentAllocation[]> {
    const rows = await db
      .selectFrom('payment_allocations')
      .selectAll()
      .where('payment_received_id', '=', paymentReceivedId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(
    db: Kysely<TenantDatabase>,
    paymentReceivedId: string,
    input: CreatePaymentAllocationRow,
  ): Promise<PaymentAllocation> {
    const row = await db
      .insertInto('payment_allocations')
      .values({
        id: randomUUID(),
        payment_received_id: paymentReceivedId,
        sales_invoice_id: input.salesInvoiceId,
        allocated_amount_amount: input.allocatedAmount.toMinorUnits().toString(),
        allocated_amount_currency: input.allocatedAmount.currency,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async sumAllocatedAmountBySalesInvoiceIds(
    db: Kysely<TenantDatabase>,
    salesInvoiceIds: string[],
  ): Promise<Record<string, Money>> {
    if (salesInvoiceIds.length === 0) return {};

    const rows = await db
      .selectFrom('payment_allocations')
      .innerJoin('payments_received', 'payments_received.id', 'payment_allocations.payment_received_id')
      .select((eb) => [
        'payment_allocations.sales_invoice_id as sales_invoice_id',
        'payment_allocations.allocated_amount_currency as allocated_amount_currency',
        eb.fn.sum<string>('payment_allocations.allocated_amount_amount').as('total'),
      ])
      .where('payments_received.status', '=', 'posted')
      .where('payment_allocations.sales_invoice_id', 'in', salesInvoiceIds)
      .groupBy(['payment_allocations.sales_invoice_id', 'payment_allocations.allocated_amount_currency'])
      .execute();

    const result: Record<string, Money> = {};
    for (const row of rows) {
      result[row.sales_invoice_id] = Money.fromMinorUnits(BigInt(row.total), row.allocated_amount_currency);
    }
    return result;
  }
}
