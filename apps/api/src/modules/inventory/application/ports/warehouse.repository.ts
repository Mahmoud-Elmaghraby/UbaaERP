import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { Warehouse, CreateWarehouseInput, UpdateWarehouseInput } from '../../domain/warehouse.entity';

export interface WarehouseRepository {
  list(db: Kysely<TenantDatabase>): Promise<Warehouse[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<Warehouse | null>;
  create(db: Kysely<TenantDatabase>, input: CreateWarehouseInput): Promise<Warehouse>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateWarehouseInput): Promise<Warehouse | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const WAREHOUSE_REPOSITORY = Symbol('WAREHOUSE_REPOSITORY');
