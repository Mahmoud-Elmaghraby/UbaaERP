import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Selectable } from 'kysely';
import type { WarehouseLocationsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { WarehouseLocationRepository } from '../../application/ports/warehouse-location.repository';
import type {
  WarehouseLocation,
  CreateWarehouseLocationInput,
  UpdateWarehouseLocationInput,
} from '../../domain/warehouse-location.entity';

function toDomain(row: Selectable<WarehouseLocationsTable>): WarehouseLocation {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    code: row.code,
    name: row.name,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyWarehouseLocationRepository implements WarehouseLocationRepository {
  async listByWarehouseId(db: Kysely<TenantDatabase>, warehouseId: string): Promise<WarehouseLocation[]> {
    const rows = await db
      .selectFrom('warehouse_locations')
      .selectAll()
      .where('warehouse_id', '=', warehouseId)
      .orderBy('code')
      .execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<WarehouseLocation | null> {
    const row = await db.selectFrom('warehouse_locations').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateWarehouseLocationInput): Promise<WarehouseLocation> {
    const row = await db
      .insertInto('warehouse_locations')
      .values({
        id: randomUUID(),
        warehouse_id: input.warehouseId,
        code: input.code,
        name: input.name,
        is_active: input.isActive ?? true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateWarehouseLocationInput,
  ): Promise<WarehouseLocation | null> {
    const row = await db
      .updateTable('warehouse_locations')
      .set({
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('warehouse_locations').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
