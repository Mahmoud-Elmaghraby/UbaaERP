import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { SalesOrderLine, CreateSalesOrderLineInput } from '../../domain/sales-order.entity';

export interface SalesOrderLineRepository {
  listBySalesOrderId(db: Kysely<TenantDatabase>, salesOrderId: string): Promise<SalesOrderLine[]>;
  create(db: Kysely<TenantDatabase>, salesOrderId: string, input: CreateSalesOrderLineInput): Promise<SalesOrderLine>;
  deleteBySalesOrderId(db: Kysely<TenantDatabase>, salesOrderId: string): Promise<void>;
}

export const SALES_ORDER_LINE_REPOSITORY = Symbol('SALES_ORDER_LINE_REPOSITORY');
