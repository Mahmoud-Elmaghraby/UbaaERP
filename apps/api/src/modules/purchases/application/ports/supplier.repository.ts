import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { Supplier, CreateSupplierInput, UpdateSupplierInput } from '../../domain/supplier.entity';

export interface SupplierRepository {
  list(db: Kysely<TenantDatabase>): Promise<Supplier[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<Supplier | null>;
  create(db: Kysely<TenantDatabase>, input: CreateSupplierInput): Promise<Supplier>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateSupplierInput): Promise<Supplier | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const SUPPLIER_REPOSITORY = Symbol('SUPPLIER_REPOSITORY');
