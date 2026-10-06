import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Selectable } from 'kysely';
import type { WarehousesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { WarehouseRepository } from '../../application/ports/warehouse.repository';
import type { Warehouse, CreateWarehouseInput, UpdateWarehouseInput } from '../../domain/warehouse.entity';

function toDomain(row: Selectable<WarehousesTable>): Warehouse {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    branchId: row.branch_id,
    isActive: row.is_active,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyWarehouseRepository implements WarehouseRepository {
  async list(db: Kysely<TenantDatabase>): Promise<Warehouse[]> {
    const rows = await db.selectFrom('warehouses').selectAll().orderBy('name').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<Warehouse | null> {
    const row = await db.selectFrom('warehouses').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateWarehouseInput): Promise<Warehouse> {
    const row = await db
      .insertInto('warehouses')
      .values({
        id: randomUUID(),
        name: input.name,
        code: input.code,
        address: input.address ?? null,
        branch_id: input.branchId ?? null,
        is_active: input.isActive ?? true,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateWarehouseInput): Promise<Warehouse | null> {
    const row = await db
      .updateTable('warehouses')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.branchId !== undefined ? { branch_id: input.branchId } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        ...(input.customFields !== undefined ? { custom_fields: JSON.stringify(input.customFields) } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('warehouses').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
