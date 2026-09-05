import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { GoodsReceiptsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  GoodsReceiptRepository,
  CreateGoodsReceiptRow,
} from '../../application/ports/goods-receipt.repository';
import type { GoodsReceipt, GoodsReceiptStatus } from '../../domain/goods-receipt.entity';

function toDomain(row: Selectable<GoodsReceiptsTable>): GoodsReceipt {
  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    purchaseOrderId: row.purchase_order_id,
    warehouseId: row.warehouse_id,
    status: row.status as GoodsReceiptStatus,
    receivedDate: row.received_date,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyGoodsReceiptRepository implements GoodsReceiptRepository {
  async list(db: Kysely<TenantDatabase>): Promise<GoodsReceipt[]> {
    const rows = await db.selectFrom('goods_receipts').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async listByPurchaseOrderId(db: Kysely<TenantDatabase>, purchaseOrderId: string): Promise<GoodsReceipt[]> {
    const rows = await db
      .selectFrom('goods_receipts')
      .selectAll()
      .where('purchase_order_id', '=', purchaseOrderId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<GoodsReceipt | null> {
    const row = await db.selectFrom('goods_receipts').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateGoodsReceiptRow): Promise<GoodsReceipt> {
    const row = await db
      .insertInto('goods_receipts')
      .values({
        id: randomUUID(),
        receipt_number: input.receiptNumber,
        purchase_order_id: input.purchaseOrderId,
        warehouse_id: input.warehouseId,
        status: 'draft',
        received_date: input.receivedDate,
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
    status: GoodsReceiptStatus,
  ): Promise<GoodsReceipt | null> {
    const row = await db
      .updateTable('goods_receipts')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('goods_receipts').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
