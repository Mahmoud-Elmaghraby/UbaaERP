import type { LineTaxSnapshot } from '../../../../shared/taxes/line-tax-snapshot';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PurchaseInvoiceLine } from '../../domain/purchase-invoice.entity';

export interface CreatePurchaseInvoiceLineRow {
  purchaseOrderLineId: string;
  productVariantId: string;
  quantityInvoiced: number;
  unitPrice: Money;
  netAmount: Money;
  taxes: LineTaxSnapshot[];
  notes: string | null;
  /** Line unit (migration 0079); omitted = base unit, factor 1. */
  unitOfMeasureId?: string | null;
  unitFactor?: number;
}

export interface PurchaseInvoiceLineRepository {
  listByPurchaseInvoiceId(db: Kysely<TenantDatabase>, purchaseInvoiceId: string): Promise<PurchaseInvoiceLine[]>;
  create(
    db: Kysely<TenantDatabase>,
    purchaseInvoiceId: string,
    input: CreatePurchaseInvoiceLineRow,
  ): Promise<PurchaseInvoiceLine>;
  /**
   * Sums quantity_invoiced across every *posted* purchase invoice line
   * for each given purchase_order_line_id — draft/cancelled invoices
   * never count. Same shape as GoodsReceiptLineRepository's
   * sumReceivedQuantityByPurchaseOrderLineIds.
   */
  sumInvoicedQuantityByPurchaseOrderLineIds(
    db: Kysely<TenantDatabase>,
    purchaseOrderLineIds: string[],
  ): Promise<Record<string, number>>;
}

export const PURCHASE_INVOICE_LINE_REPOSITORY = Symbol('PURCHASE_INVOICE_LINE_REPOSITORY');
