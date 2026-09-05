import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { SalesOrdersTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  SalesOrderRepository,
  CreateSalesOrderRow,
  UpdateSalesOrderRow,
} from '../../application/ports/sales-order.repository';
import type { SalesOrder, SalesOrderStatus } from '../../domain/sales-order.entity';

function toDomain(row: Selectable<SalesOrdersTable>): SalesOrder {
  return {
    id: row.id,
    soNumber: row.so_number,
    customerId: row.customer_id,
    sourceQuotationId: row.source_quotation_id,
    status: row.status as SalesOrderStatus,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselySalesOrderRepository implements SalesOrderRepository {
  async list(db: Kysely<TenantDatabase>): Promise<SalesOrder[]> {
    const rows = await db.selectFrom('sales_orders').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<SalesOrder | null> {
    const row = await db.selectFrom('sales_orders').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateSalesOrderRow): Promise<SalesOrder> {
    const row = await db
      .insertInto('sales_orders')
      .values({
        id: randomUUID(),
        so_number: input.soNumber,
        customer_id: input.customerId,
        source_quotation_id: input.sourceQuotationId,
        status: 'draft',
        notes: input.notes,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateSalesOrderRow): Promise<SalesOrder | null> {
    const row = await db
      .updateTable('sales_orders')
      .set({
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.customFields !== undefined ? { custom_fields: JSON.stringify(input.customFields) } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async updateStatus(db: Kysely<TenantDatabase>, id: string, status: SalesOrderStatus): Promise<SalesOrder | null> {
    const row = await db
      .updateTable('sales_orders')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('sales_orders').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
