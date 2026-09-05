import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PurchaseReturn, PurchaseReturnStatus } from '../../domain/purchase-return.entity';

export interface CreatePurchaseReturnRow {
  returnNumber: string;
  goodsReceiptId: string;
  returnDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
}

export interface PurchaseReturnRepository {
  list(db: Kysely<TenantDatabase>): Promise<PurchaseReturn[]>;
  listByGoodsReceiptId(db: Kysely<TenantDatabase>, goodsReceiptId: string): Promise<PurchaseReturn[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseReturn | null>;
  create(db: Kysely<TenantDatabase>, input: CreatePurchaseReturnRow): Promise<PurchaseReturn>;
  updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: PurchaseReturnStatus,
  ): Promise<PurchaseReturn | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const PURCHASE_RETURN_REPOSITORY = Symbol('PURCHASE_RETURN_REPOSITORY');
