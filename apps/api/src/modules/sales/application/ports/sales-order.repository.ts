import type { Kysely } from 'kysely';
import type { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { DiscountType, SalesOrder, SalesOrderStatus } from '../../domain/sales-order.entity';

export interface CreateSalesOrderRow {
  soNumber: string;
  customerId: string;
  sourceQuotationId: string | null;
  /** The order's own lines' currency (assertSingleCurrency-validated by the caller) — see sales-order.entity.ts's own comment on why the header stores this. */
  currency: string;
  discountType: DiscountType | null;
  discountPercentage: number | null;
  discountFixedAmount: Money | null;
  notes: string | null;
  customFields: Record<string, unknown>;
}

export interface UpdateSalesOrderRow {
  notes?: string | null;
  customFields?: Record<string, unknown>;
  discountType?: DiscountType | null;
  discountPercentage?: number | null;
  discountFixedAmount?: Money | null;
}

export interface SalesOrderRepository {
  list(db: Kysely<TenantDatabase>): Promise<SalesOrder[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<SalesOrder | null>;
  create(db: Kysely<TenantDatabase>, input: CreateSalesOrderRow): Promise<SalesOrder>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateSalesOrderRow): Promise<SalesOrder | null>;
  updateStatus(db: Kysely<TenantDatabase>, id: string, status: SalesOrderStatus): Promise<SalesOrder | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const SALES_ORDER_REPOSITORY = Symbol('SALES_ORDER_REPOSITORY');
