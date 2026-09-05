import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { GoodsReceipt, GoodsReceiptStatus } from '../../domain/goods-receipt.entity';

export interface CreateGoodsReceiptRow {
  receiptNumber: string;
  purchaseOrderId: string;
  warehouseId: string;
  receivedDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
}

export interface GoodsReceiptRepository {
  list(db: Kysely<TenantDatabase>): Promise<GoodsReceipt[]>;
  listByPurchaseOrderId(db: Kysely<TenantDatabase>, purchaseOrderId: string): Promise<GoodsReceipt[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<GoodsReceipt | null>;
  create(db: Kysely<TenantDatabase>, input: CreateGoodsReceiptRow): Promise<GoodsReceipt>;
  updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: GoodsReceiptStatus,
  ): Promise<GoodsReceipt | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const GOODS_RECEIPT_REPOSITORY = Symbol('GOODS_RECEIPT_REPOSITORY');
