import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { SalesReturnsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  SalesReturnRepository,
  CreateSalesReturnRow,
} from '../../application/ports/sales-return.repository';
import type { SalesReturn, SalesReturnStatus } from '../../domain/sales-return.entity';

function toDomain(row: Selectable<SalesReturnsTable>): SalesReturn {
  return {
    id: row.id,
    returnNumber: row.return_number,
    deliveryId: row.delivery_id,
    status: row.status as SalesReturnStatus,
    returnDate: row.return_date,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselySalesReturnRepository implements SalesReturnRepository {
  async list(db: Kysely<TenantDatabase>): Promise<SalesReturn[]> {
    const rows = await db.selectFrom('sales_returns').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async listByDeliveryId(db: Kysely<TenantDatabase>, deliveryId: string): Promise<SalesReturn[]> {
    const rows = await db
      .selectFrom('sales_returns')
      .selectAll()
      .where('delivery_id', '=', deliveryId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<SalesReturn | null> {
    const row = await db.selectFrom('sales_returns').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateSalesReturnRow): Promise<SalesReturn> {
    const row = await db
      .insertInto('sales_returns')
      .values({
        id: randomUUID(),
        return_number: input.returnNumber,
        delivery_id: input.deliveryId,
        status: 'draft',
        return_date: input.returnDate,
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
    status: SalesReturnStatus,
  ): Promise<SalesReturn | null> {
    const row = await db
      .updateTable('sales_returns')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('sales_returns').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
