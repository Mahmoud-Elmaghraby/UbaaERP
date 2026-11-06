import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PurchaseOrder, PurchaseOrderStatus } from '../../domain/purchase-order.entity';

export interface CreatePurchaseOrderRow {
  poNumber: string;
  supplierId: string;
  sourceQuotationId: string | null;
  expectedDeliveryDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
}

export interface UpdatePurchaseOrderRow {
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

export interface PurchaseOrderRepository {
  list(db: Kysely<TenantDatabase>): Promise<PurchaseOrder[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseOrder | null>;
  create(db: Kysely<TenantDatabase>, input: CreatePurchaseOrderRow): Promise<PurchaseOrder>;
  update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdatePurchaseOrderRow,
  ): Promise<PurchaseOrder | null>;
  updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: PurchaseOrderStatus,
    /** Only when the row is still in (one of) this status — a concurrent change makes it return null. */
    expectedStatus?: PurchaseOrderStatus | PurchaseOrderStatus[],
  ): Promise<PurchaseOrder | null>;
  /** Marks an order as made by a direct purchase invoice for itself (migration 0114). */
  setSourcePurchaseInvoiceId(db: Kysely<TenantDatabase>, id: string, purchaseInvoiceId: string): Promise<void>;
  /** The order a direct purchase invoice made for itself, if any. */
  findBySourcePurchaseInvoiceId(db: Kysely<TenantDatabase>, purchaseInvoiceId: string): Promise<PurchaseOrder | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const PURCHASE_ORDER_REPOSITORY = Symbol('PURCHASE_ORDER_REPOSITORY');
