import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { DeliveryLine, DeliveryLot } from '../../domain/delivery.entity';

export interface CreateDeliveryLineRow {
  salesOrderLineId: string;
  productVariantId: string;
  quantityDelivered: number;
  notes: string | null;
  lots: DeliveryLot[];
}

export interface DeliveryLineRepository {
  listByDeliveryId(db: Kysely<TenantDatabase>, deliveryId: string): Promise<DeliveryLine[]>;
  create(db: Kysely<TenantDatabase>, deliveryId: string, input: CreateDeliveryLineRow): Promise<DeliveryLine>;
  /**
   * Sums quantity_delivered across every *confirmed* delivery line for
   * each given sales_order_line_id — draft/cancelled deliveries never
   * count. Used to validate remaining quantity at creation time and to
   * recompute a sales order's partially_delivered/fully_delivered status
   * on confirm(). Missing keys mean "0 delivered". Mirrors
   * GoodsReceiptLineRepository.sumReceivedQuantityByPurchaseOrderLineIds().
   */
  sumDeliveredQuantityBySalesOrderLineIds(
    db: Kysely<TenantDatabase>,
    salesOrderLineIds: string[],
  ): Promise<Record<string, number>>;
}

export const DELIVERY_LINE_REPOSITORY = Symbol('DELIVERY_LINE_REPOSITORY');
