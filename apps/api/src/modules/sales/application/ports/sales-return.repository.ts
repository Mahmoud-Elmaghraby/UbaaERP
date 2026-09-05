import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { SalesReturn, SalesReturnStatus } from '../../domain/sales-return.entity';

export interface CreateSalesReturnRow {
  returnNumber: string;
  deliveryId: string;
  returnDate: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
}

export interface SalesReturnRepository {
  list(db: Kysely<TenantDatabase>): Promise<SalesReturn[]>;
  listByDeliveryId(db: Kysely<TenantDatabase>, deliveryId: string): Promise<SalesReturn[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<SalesReturn | null>;
  create(db: Kysely<TenantDatabase>, input: CreateSalesReturnRow): Promise<SalesReturn>;
  updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: SalesReturnStatus,
  ): Promise<SalesReturn | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const SALES_RETURN_REPOSITORY = Symbol('SALES_RETURN_REPOSITORY');
