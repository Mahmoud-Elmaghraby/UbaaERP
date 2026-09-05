import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type {
  WarehouseLocation,
  CreateWarehouseLocationInput,
  UpdateWarehouseLocationInput,
} from '../../domain/warehouse-location.entity';

export interface WarehouseLocationRepository {
  listByWarehouseId(db: Kysely<TenantDatabase>, warehouseId: string): Promise<WarehouseLocation[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<WarehouseLocation | null>;
  create(db: Kysely<TenantDatabase>, input: CreateWarehouseLocationInput): Promise<WarehouseLocation>;
  update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateWarehouseLocationInput,
  ): Promise<WarehouseLocation | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const WAREHOUSE_LOCATION_REPOSITORY = Symbol('WAREHOUSE_LOCATION_REPOSITORY');
