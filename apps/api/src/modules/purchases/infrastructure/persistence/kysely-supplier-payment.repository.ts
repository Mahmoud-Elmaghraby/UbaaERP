import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { SupplierPaymentsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  SupplierPaymentRepository,
  CreateSupplierPaymentRow,
} from '../../application/ports/supplier-payment.repository';
import type {
  SupplierPayment,
  SupplierPaymentStatus,
  SupplierPaymentMethod,
} from '../../domain/supplier-payment.entity';

function toDomain(row: Selectable<SupplierPaymentsTable>): SupplierPayment {
  return {
    id: row.id,
    paymentNumber: row.payment_number,
    supplierId: row.supplier_id,
    status: row.status as SupplierPaymentStatus,
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method as SupplierPaymentMethod,
    referenceNumber: row.reference_number,
    amount: Money.fromMinorUnits(BigInt(row.amount_amount), row.amount_currency),
    treasuryId: row.treasury_id,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselySupplierPaymentRepository implements SupplierPaymentRepository {
  async list(db: Kysely<TenantDatabase>): Promise<SupplierPayment[]> {
    const rows = await db.selectFrom('supplier_payments').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async listBySupplierId(db: Kysely<TenantDatabase>, supplierId: string): Promise<SupplierPayment[]> {
    const rows = await db
      .selectFrom('supplier_payments')
      .selectAll()
      .where('supplier_id', '=', supplierId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<SupplierPayment | null> {
    const row = await db.selectFrom('supplier_payments').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateSupplierPaymentRow): Promise<SupplierPayment> {
    const row = await db
      .insertInto('supplier_payments')
      .values({
        id: randomUUID(),
        payment_number: input.paymentNumber,
        supplier_id: input.supplierId,
        status: 'draft',
        payment_date: input.paymentDate,
        payment_method: input.paymentMethod,
        reference_number: input.referenceNumber,
        amount_amount: input.amount.toMinorUnits().toString(),
        amount_currency: input.amount.currency,
        treasury_id: input.treasuryId,
        notes: input.notes,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: SupplierPaymentStatus,
  ): Promise<SupplierPayment | null> {
    const row = await db
      .updateTable('supplier_payments')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('supplier_payments').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
