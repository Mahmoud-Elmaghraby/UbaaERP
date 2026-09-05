import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { GoodsReceiptLine } from '../../domain/goods-receipt.entity';

export interface CreateGoodsReceiptLineRow {
  purchaseOrderLineId: string;
  productVariantId: string;
  quantityReceived: number;
  unitCost: Money;
  notes: string | null;
}

export interface GoodsReceiptLineRepository {
  listByGoodsReceiptId(db: Kysely<TenantDatabase>, goodsReceiptId: string): Promise<GoodsReceiptLine[]>;
  create(
    db: Kysely<TenantDatabase>,
    goodsReceiptId: string,
    input: CreateGoodsReceiptLineRow,
  ): Promise<GoodsReceiptLine>;
  /**
   * Sums quantity_received across every *confirmed* goods receipt line
   * for each given purchase_order_line_id — draft/cancelled receipts
   * never count. Used to validate remaining quantity at creation time
   * and to recompute a purchase order's partially_received/
   * fully_received status on confirm(). Missing keys mean "0 received".
   */
  sumReceivedQuantityByPurchaseOrderLineIds(
    db: Kysely<TenantDatabase>,
    purchaseOrderLineIds: string[],
  ): Promise<Record<string, number>>;
}

export const GOODS_RECEIPT_LINE_REPOSITORY = Symbol('GOODS_RECEIPT_LINE_REPOSITORY');
