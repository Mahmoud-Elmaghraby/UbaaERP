import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { SalesInvoice, SalesInvoiceStatus } from '../../domain/sales-invoice.entity';

export interface CreateSalesInvoiceRow {
  invoiceNumber: string;
  salesOrderId: string;
  invoiceDate: string | null;
  dueDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
}

export interface SalesInvoiceRepository {
  list(db: Kysely<TenantDatabase>): Promise<SalesInvoice[]>;
  listBySalesOrderId(db: Kysely<TenantDatabase>, salesOrderId: string): Promise<SalesInvoice[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<SalesInvoice | null>;
  create(db: Kysely<TenantDatabase>, input: CreateSalesInvoiceRow): Promise<SalesInvoice>;
  updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: SalesInvoiceStatus,
  ): Promise<SalesInvoice | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const SALES_INVOICE_REPOSITORY = Symbol('SALES_INVOICE_REPOSITORY');
