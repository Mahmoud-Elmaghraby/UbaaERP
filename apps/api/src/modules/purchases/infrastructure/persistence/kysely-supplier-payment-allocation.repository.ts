import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { SupplierPaymentAllocationsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  SupplierPaymentAllocationRepository,
  CreateSupplierPaymentAllocationRow,
} from '../../application/ports/supplier-payment-allocation.repository';
import type { SupplierPaymentAllocation } from '../../domain/supplier-payment.entity';

function toDomain(row: Selectable<SupplierPaymentAllocationsTable>): SupplierPaymentAllocation {
  return {
    id: row.id,
    supplierPaymentId: row.supplier_payment_id,
    purchaseInvoiceId: row.purchase_invoice_id,
    allocatedAmount: Money.fromMinorUnits(BigInt(row.allocated_amount_amount), row.allocated_amount_currency),
    createdAt: row.created_at,
  };
}

export class KyselySupplierPaymentAllocationRepository implements SupplierPaymentAllocationRepository {
  async listBySupplierPaymentId(
    db: Kysely<TenantDatabase>,
    supplierPaymentId: string,
  ): Promise<SupplierPaymentAllocation[]> {
    const rows = await db
      .selectFrom('supplier_payment_allocations')
      .selectAll()
      .where('supplier_payment_id', '=', supplierPaymentId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async create(
    db: Kysely<TenantDatabase>,
    supplierPaymentId: string,
    input: CreateSupplierPaymentAllocationRow,
  ): Promise<SupplierPaymentAllocation> {
    const row = await db
      .insertInto('supplier_payment_allocations')
      .values({
        id: randomUUID(),
        supplier_payment_id: supplierPaymentId,
        purchase_invoice_id: input.purchaseInvoiceId,
        allocated_amount_amount: input.allocatedAmount.toMinorUnits().toString(),
        allocated_amount_currency: input.allocatedAmount.currency,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async sumAllocatedAmountByPurchaseInvoiceIds(
    db: Kysely<TenantDatabase>,
    purchaseInvoiceIds: string[],
  ): Promise<Record<string, Money>> {
    if (purchaseInvoiceIds.length === 0) return {};

    const rows = await db
      .selectFrom('supplier_payment_allocations')
      .innerJoin('supplier_payments', 'supplier_payments.id', 'supplier_payment_allocations.supplier_payment_id')
      .select((eb) => [
        'supplier_payment_allocations.purchase_invoice_id as purchase_invoice_id',
        'supplier_payment_allocations.allocated_amount_currency as allocated_amount_currency',
        eb.fn.sum<string>('supplier_payment_allocations.allocated_amount_amount').as('total'),
      ])
      .where('supplier_payments.status', '=', 'posted')
      .where('supplier_payment_allocations.purchase_invoice_id', 'in', purchaseInvoiceIds)
      .groupBy([
        'supplier_payment_allocations.purchase_invoice_id',
        'supplier_payment_allocations.allocated_amount_currency',
      ])
      .execute();

    const result: Record<string, Money> = {};
    for (const row of rows) {
      result[row.purchase_invoice_id] = Money.fromMinorUnits(BigInt(row.total), row.allocated_amount_currency);
    }
    return result;
  }
}
