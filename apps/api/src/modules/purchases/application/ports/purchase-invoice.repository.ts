import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PurchaseInvoice, PurchaseInvoiceStatus } from '../../domain/purchase-invoice.entity';

export interface CreatePurchaseInvoiceRow {
  invoiceNumber: string;
  supplierInvoiceNumber: string | null;
  purchaseOrderId: string;
  invoiceDate: string | null;
  dueDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  pricesIncludeTax?: boolean;
}

export interface PurchaseInvoiceRepository {
  list(db: Kysely<TenantDatabase>): Promise<PurchaseInvoice[]>;
  listByPurchaseOrderId(db: Kysely<TenantDatabase>, purchaseOrderId: string): Promise<PurchaseInvoice[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<PurchaseInvoice | null>;
  /** Posted invoices whose purchase order belongs to the given supplier (oldest first) — supplier payment allocation. */
  listPostedBySupplierId(db: Kysely<TenantDatabase>, supplierId: string): Promise<PurchaseInvoice[]>;
  create(db: Kysely<TenantDatabase>, input: CreatePurchaseInvoiceRow): Promise<PurchaseInvoice>;
  updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: PurchaseInvoiceStatus,
  ): Promise<PurchaseInvoice | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const PURCHASE_INVOICE_REPOSITORY = Symbol('PURCHASE_INVOICE_REPOSITORY');
