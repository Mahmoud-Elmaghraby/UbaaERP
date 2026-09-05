import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { WAREHOUSE_REPOSITORY, type WarehouseRepository } from '../ports/warehouse.repository';
import {
  WAREHOUSE_LOCATION_REPOSITORY,
  type WarehouseLocationRepository,
} from '../ports/warehouse-location.repository';
import type { Warehouse, CreateWarehouseInput, UpdateWarehouseInput } from '../../domain/warehouse.entity';
import {
  DEFAULT_LOCATION_CODE,
  DEFAULT_LOCATION_NAME,
  type WarehouseLocation,
} from '../../domain/warehouse-location.entity';
import {
  ConflictError,
  NotFoundError,
  isPostgresForeignKeyViolation,
  isPostgresUniqueViolation,
} from '../errors';

export interface WarehouseWithDefaultLocation extends Warehouse {
  defaultLocation: WarehouseLocation;
}

@Injectable()
export class WarehousesService {
  constructor(
    @Inject(WAREHOUSE_REPOSITORY) private readonly repository: WarehouseRepository,
    @Inject(WAREHOUSE_LOCATION_REPOSITORY) private readonly locations: WarehouseLocationRepository,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<Warehouse[]> {
    return this.repository.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<Warehouse> {
    const warehouse = await this.repository.findById(db, id);
    if (!warehouse) throw new NotFoundError(`Warehouse "${id}" not found.`);
    return warehouse;
  }

  /**
   * Creates the warehouse and its one auto-provisioned "default" location
   * in the same transaction — every stock_levels/stock_movements row keys
   * off location_id, so a warehouse must never exist with zero locations
   * (same "always at least one" pattern as ProductsService's default
   * variant). Tenants that never bother naming sub-locations still work
   * end-to-end; tenants that do can add more via WarehouseLocationsService.
   */
  async create(db: Kysely<TenantDatabase>, input: CreateWarehouseInput): Promise<WarehouseWithDefaultLocation> {
    try {
      return await db.transaction().execute(async (trx) => {
        const warehouse = await this.repository.create(trx, input);
        const defaultLocation = await this.locations.create(trx, {
          warehouseId: warehouse.id,
          code: DEFAULT_LOCATION_CODE,
          name: DEFAULT_LOCATION_NAME,
        });
        return { ...warehouse, defaultLocation };
      });
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(`A warehouse with code "${input.code}" already exists.`);
      }
      if (isPostgresForeignKeyViolation(err)) {
        throw new NotFoundError(`Branch "${input.branchId}" not found.`);
      }
      throw err;
    }
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateWarehouseInput): Promise<Warehouse> {
    try {
      const updated = await this.repository.update(db, id, input);
      if (!updated) throw new NotFoundError(`Warehouse "${id}" not found.`);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(`A warehouse with code "${input.code}" already exists.`);
      }
      if (isPostgresForeignKeyViolation(err)) {
        throw new NotFoundError(`Branch "${input.branchId}" not found.`);
      }
      throw err;
    }
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const deleted = await this.repository.delete(db, id);
    if (!deleted) throw new NotFoundError(`Warehouse "${id}" not found.`);
  }

  listLocations(db: Kysely<TenantDatabase>, warehouseId: string): Promise<WarehouseLocation[]> {
    return this.locations.listByWarehouseId(db, warehouseId);
  }

  async addLocation(
    db: Kysely<TenantDatabase>,
    warehouseId: string,
    input: { code: string; name: string; isActive?: boolean },
  ): Promise<WarehouseLocation> {
    await this.getById(db, warehouseId);
    try {
      return await this.locations.create(db, { warehouseId, ...input });
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(`A location with code "${input.code}" already exists in this warehouse.`);
      }
      throw err;
    }
  }

  async updateLocation(
    db: Kysely<TenantDatabase>,
    locationId: string,
    input: { code?: string; name?: string; isActive?: boolean },
  ): Promise<WarehouseLocation> {
    try {
      const updated = await this.locations.update(db, locationId, input);
      if (!updated) throw new NotFoundError(`Warehouse location "${locationId}" not found.`);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(`A location with code "${input.code}" already exists in this warehouse.`);
      }
      throw err;
    }
  }

  async deleteLocation(db: Kysely<TenantDatabase>, locationId: string): Promise<void> {
    try {
      const deleted = await this.locations.delete(db, locationId);
      if (!deleted) throw new NotFoundError(`Warehouse location "${locationId}" not found.`);
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new ConflictError('Cannot delete a location that still has stock recorded against it.');
      }
      throw err;
    }
  }
}
