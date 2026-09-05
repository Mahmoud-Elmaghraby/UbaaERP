import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { PurchaseReturnsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  PurchaseReturnRepository,
  CreatePurchaseReturnRow,
} from '../../application/ports/purchase-return.repository';
import type { PurchaseReturn, PurchaseReturnStatus } from '../../domain/purchase-return.entity';

function toDomain(row: Selectable<PurchaseReturnsTable>): PurchaseReturn {
  return {
    id: row.id,
    returnNumber: row.return_number,
    goodsReceiptId: row.goods_receipt_id,
    status: row.status as PurchaseReturnStatus,
    returnDate: row.return_date,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyPurchaseReturnRepository implements PurchaseReturnRepository {
  async list(db: Kysely<TenantDatabase>): Promise<PurchaseReturn[]> {
    const rows = await db.selectFrom('purchase_returns').selectAll().orderBy('created_at', 'desc').execute();
    return rows.map(toDomain);
  }

  async listByGoodsReceiptId(db: Kysely<TenantDatabase>, goodsReceiptId: string): Promise<PurchaseReturn[]> {
    const rows = await db
      .selectFrom('purchase_returns')
      .selectAll()
      .where('goods_receipt_id', '=', goodsReceiptId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseReturn | null> {
    const row = await db.selectFrom('purchase_returns').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreatePurchaseReturnRow): Promise<PurchaseReturn> {
    const row = await db
      .insertInto('purchase_returns')
      .values({
        id: randomUUID(),
        return_number: input.returnNumber,
        goods_receipt_id: input.goodsReceiptId,
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
    status: PurchaseReturnStatus,
  ): Promise<PurchaseReturn | null> {
    const row = await db
      .updateTable('purchase_returns')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('purchase_returns').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
