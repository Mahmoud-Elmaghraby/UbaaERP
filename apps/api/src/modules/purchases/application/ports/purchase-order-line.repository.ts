import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PurchaseOrderLine, CreatePurchaseOrderLineInput } from '../../domain/purchase-order.entity';

export interface PurchaseOrderLineRepository {
  listByPurchaseOrderId(db: Kysely<TenantDatabase>, purchaseOrderId: string): Promise<PurchaseOrderLine[]>;
  create(
    db: Kysely<TenantDatabase>,
    purchaseOrderId: string,
    input: CreatePurchaseOrderLineInput,
  ): Promise<PurchaseOrderLine>;
  deleteByPurchaseOrderId(db: Kysely<TenantDatabase>, purchaseOrderId: string): Promise<void>;
}

export const PURCHASE_ORDER_LINE_REPOSITORY = Symbol('PURCHASE_ORDER_LINE_REPOSITORY');
