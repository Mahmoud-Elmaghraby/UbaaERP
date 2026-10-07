import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { SalesReturnLine } from '../../domain/sales-return.entity';

export interface CreateSalesReturnLineRow {
  deliveryLineId: string;
  productVariantId: string;
  quantityReturned: number;
  reason: string | null;
  notes: string | null;
  /** Line unit (migration 0079); omitted = base unit, factor 1. */
  unitOfMeasureId?: string | null;
  unitFactor?: number;
}

export interface SalesReturnLineRepository {
  listBySalesReturnId(db: Kysely<TenantDatabase>, salesReturnId: string): Promise<SalesReturnLine[]>;
  create(
    db: Kysely<TenantDatabase>,
    salesReturnId: string,
    input: CreateSalesReturnLineRow,
  ): Promise<SalesReturnLine>;
  /**
   * Sums quantity_returned across every *confirmed* sales return line
   * for each given delivery_line_id — draft/cancelled returns never
   * count. Missing keys mean "0 returned so far". Same shape as
   * PurchaseReturnLineRepository.sumReturnedQuantityByGoodsReceiptLineIds.
   */
  sumReturnedQuantityByDeliveryLineIds(
    db: Kysely<TenantDatabase>,
    deliveryLineIds: string[],
  ): Promise<Record<string, number>>;
}

export const SALES_RETURN_LINE_REPOSITORY = Symbol('SALES_RETURN_LINE_REPOSITORY');
