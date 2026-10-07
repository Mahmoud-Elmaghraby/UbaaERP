import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { SalesInvoiceLine } from '../../domain/sales-invoice.entity';

export interface CreateSalesInvoiceLineRow {
  salesOrderLineId: string;
  productVariantId: string;
  quantityInvoiced: number;
  unitPrice: Money;
  notes: string | null;
  /** Line unit (migration 0079); omitted = base unit, factor 1. */
  unitOfMeasureId?: string | null;
  unitFactor?: number;
}

export interface SalesInvoiceLineRepository {
  listBySalesInvoiceId(db: Kysely<TenantDatabase>, salesInvoiceId: string): Promise<SalesInvoiceLine[]>;
  create(
    db: Kysely<TenantDatabase>,
    salesInvoiceId: string,
    input: CreateSalesInvoiceLineRow,
  ): Promise<SalesInvoiceLine>;
  /**
   * Sums quantity_invoiced across every *posted* sales invoice line for
   * each given sales_order_line_id — draft/cancelled invoices never
   * count. Same shape as
   * PurchaseInvoiceLineRepository.sumInvoicedQuantityByPurchaseOrderLineIds.
   */
  sumInvoicedQuantityBySalesOrderLineIds(
    db: Kysely<TenantDatabase>,
    salesOrderLineIds: string[],
  ): Promise<Record<string, number>>;
}

export const SALES_INVOICE_LINE_REPOSITORY = Symbol('SALES_INVOICE_LINE_REPOSITORY');
