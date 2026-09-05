import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { PaymentsReceivedTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  PaymentReceivedRepository,
  CreatePaymentReceivedRow,
} from '../../application/ports/payment-received.repository';
import type {
  PaymentReceived,
  PaymentReceivedStatus,
  PaymentMethod,
} from '../../domain/payment-received.entity';

function toDomain(row: Selectable<PaymentsReceivedTable>): PaymentReceived {
  return {
    id: row.id,
    paymentNumber: row.payment_number,
    customerId: row.customer_id,
    status: row.status as PaymentReceivedStatus,
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method as PaymentMethod,
    referenceNumber: row.reference_number,
    amount: Money.fromMinorUnits(BigInt(row.amount_amount), row.amount_currency),
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyPaymentReceivedRepository implements PaymentReceivedRepository {
  async list(db: Kysely<TenantDatabase>): Promise<PaymentReceived[]> {
    const rows = await db.selectFrom('payments_received').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async listByCustomerId(db: Kysely<TenantDatabase>, customerId: string): Promise<PaymentReceived[]> {
    const rows = await db
      .selectFrom('payments_received')
      .selectAll()
      .where('customer_id', '=', customerId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<PaymentReceived | null> {
    const row = await db.selectFrom('payments_received').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreatePaymentReceivedRow): Promise<PaymentReceived> {
    const row = await db
      .insertInto('payments_received')
      .values({
        id: randomUUID(),
        payment_number: input.paymentNumber,
        customer_id: input.customerId,
        status: 'draft',
        payment_date: input.paymentDate,
        payment_method: input.paymentMethod,
        reference_number: input.referenceNumber,
        amount_amount: input.amount.toMinorUnits().toString(),
        amount_currency: input.amount.currency,
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
    status: PaymentReceivedStatus,
  ): Promise<PaymentReceived | null> {
    const row = await db
      .updateTable('payments_received')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('payments_received').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
