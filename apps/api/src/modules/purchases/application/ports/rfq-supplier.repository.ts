import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';

export interface RfqSupplierRepository {
  listSupplierIdsByRfqId(db: Kysely<TenantDatabase>, rfqId: string): Promise<string[]>;
  add(db: Kysely<TenantDatabase>, rfqId: string, supplierId: string): Promise<void>;
  deleteByRfqId(db: Kysely<TenantDatabase>, rfqId: string): Promise<void>;
}

export const RFQ_SUPPLIER_REPOSITORY = Symbol('RFQ_SUPPLIER_REPOSITORY');
