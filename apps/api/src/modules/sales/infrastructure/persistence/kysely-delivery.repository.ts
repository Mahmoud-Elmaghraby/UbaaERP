import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { DeliveriesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  DeliveryRepository,
  CreateDeliveryRow,
} from '../../application/ports/delivery.repository';
import type { Delivery, DeliveryStatus } from '../../domain/delivery.entity';

function toDomain(row: Selectable<DeliveriesTable>): Delivery {
  return {
    id: row.id,
    deliveryNumber: row.delivery_number,
    salesOrderId: row.sales_order_id,
    warehouseId: row.warehouse_id,
    status: row.status as DeliveryStatus,
    deliveryDate: row.delivery_date,
    sourceSalesInvoiceId: row.source_sales_invoice_id ?? null,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyDeliveryRepository implements DeliveryRepository {
  async list(db: Kysely<TenantDatabase>): Promise<Delivery[]> {
    const rows = await db.selectFrom('deliveries').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async listBySalesOrderId(db: Kysely<TenantDatabase>, salesOrderId: string): Promise<Delivery[]> {
    const rows = await db
      .selectFrom('deliveries')
      .selectAll()
      .where('sales_order_id', '=', salesOrderId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<Delivery | null> {
    const row = await db.selectFrom('deliveries').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateDeliveryRow): Promise<Delivery> {
    const row = await db
      .insertInto('deliveries')
      .values({
        id: randomUUID(),
        delivery_number: input.deliveryNumber,
        sales_order_id: input.salesOrderId,
        warehouse_id: input.warehouseId,
        status: 'draft',
        delivery_date: input.deliveryDate,
        notes: input.notes,
        custom_fields: JSON.stringify(input.customFields ?? {}),
        source_sales_invoice_id: input.sourceSalesInvoiceId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async listBySourceSalesInvoiceId(db: Kysely<TenantDatabase>, salesInvoiceId: string): Promise<Delivery[]> {
    const rows = await db
      .selectFrom('deliveries')
      .selectAll()
      .where('source_sales_invoice_id', '=', salesInvoiceId)
      .orderBy('created_at')
      .execute();
    return rows.map(toDomain);
  }

  async updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: DeliveryStatus,
    expectedStatus?: DeliveryStatus | DeliveryStatus[],
  ): Promise<Delivery | null> {
    const row = await db
      .updateTable('deliveries')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .$if(expectedStatus !== undefined, (q) =>
        q.where('status', 'in', ([] as DeliveryStatus[]).concat(expectedStatus ?? [])),
      )
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('deliveries').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
