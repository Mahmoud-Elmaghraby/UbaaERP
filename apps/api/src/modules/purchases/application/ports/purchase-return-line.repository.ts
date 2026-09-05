import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PurchaseReturnLine } from '../../domain/purchase-return.entity';

export interface CreatePurchaseReturnLineRow {
  goodsReceiptLineId: string;
  productVariantId: string;
  quantityReturned: number;
  reason: string | null;
  notes: string | null;
}

export interface PurchaseReturnLineRepository {
  listByPurchaseReturnId(db: Kysely<TenantDatabase>, purchaseReturnId: string): Promise<PurchaseReturnLine[]>;
  create(
    db: Kysely<TenantDatabase>,
    purchaseReturnId: string,
    input: CreatePurchaseReturnLineRow,
  ): Promise<PurchaseReturnLine>;
  /**
   * Sums quantity_returned across every *confirmed* purchase return line
   * for each given goods_receipt_line_id — draft/cancelled returns never
   * count. Missing keys mean "0 returned so far". Same shape as
   * GoodsReceiptLineRepository.sumReceivedQuantityByPurchaseOrderLineIds.
   */
  sumReturnedQuantityByGoodsReceiptLineIds(
    db: Kysely<TenantDatabase>,
    goodsReceiptLineIds: string[],
  ): Promise<Record<string, number>>;
}

export const PURCHASE_RETURN_LINE_REPOSITORY = Symbol('PURCHASE_RETURN_LINE_REPOSITORY');
