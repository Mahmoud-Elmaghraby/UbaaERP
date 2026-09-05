import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { PurchaseOrdersTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  PurchaseOrderRepository,
  CreatePurchaseOrderRow,
  UpdatePurchaseOrderRow,
} from '../../application/ports/purchase-order.repository';
import type { PurchaseOrder, PurchaseOrderStatus } from '../../domain/purchase-order.entity';

function toDomain(row: Selectable<PurchaseOrdersTable>): PurchaseOrder {
  return {
    id: row.id,
    poNumber: row.po_number,
    supplierId: row.supplier_id,
    sourceQuotationId: row.source_quotation_id,
    status: row.status as PurchaseOrderStatus,
    expectedDeliveryDate: row.expected_delivery_date,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyPurchaseOrderRepository implements PurchaseOrderRepository {
  async list(db: Kysely<TenantDatabase>): Promise<PurchaseOrder[]> {
    const rows = await db.selectFrom('purchase_orders').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseOrder | null> {
    const row = await db.selectFrom('purchase_orders').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreatePurchaseOrderRow): Promise<PurchaseOrder> {
    const row = await db
      .insertInto('purchase_orders')
      .values({
        id: randomUUID(),
        po_number: input.poNumber,
        supplier_id: input.supplierId,
        source_quotation_id: input.sourceQuotationId,
        status: 'draft',
        expected_delivery_date: input.expectedDeliveryDate,
        notes: input.notes,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdatePurchaseOrderRow,
  ): Promise<PurchaseOrder | null> {
    const row = await db
      .updateTable('purchase_orders')
      .set({
        ...(input.expectedDeliveryDate !== undefined ? { expected_delivery_date: input.expectedDeliveryDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.customFields !== undefined ? { custom_fields: JSON.stringify(input.customFields) } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: PurchaseOrderStatus,
  ): Promise<PurchaseOrder | null> {
    const row = await db
      .updateTable('purchase_orders')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('purchase_orders').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
