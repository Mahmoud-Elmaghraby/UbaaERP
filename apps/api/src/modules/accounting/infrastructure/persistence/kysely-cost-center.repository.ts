import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { CostCentersTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { CostCenterRepository } from '../../application/ports/cost-center.repository';
import type {
  CostCenter,
  CostCenterFilters,
  CreateCostCenterInput,
  UpdateCostCenterInput,
} from '../../domain/cost-center.entity';

function toDomain(row: Selectable<CostCentersTable>): CostCenter {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.is_active,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyCostCenterRepository implements CostCenterRepository {
  async list(db: Kysely<TenantDatabase>, filters?: CostCenterFilters): Promise<CostCenter[]> {
    let query = db.selectFrom('cost_centers').selectAll();
    if (filters?.isActive !== undefined) query = query.where('is_active', '=', filters.isActive);
    const rows = await query.orderBy('code').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<CostCenter | null> {
    const row = await db.selectFrom('cost_centers').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateCostCenterInput): Promise<CostCenter> {
    const row = await db
      .insertInto('cost_centers')
      .values({
        id: randomUUID(),
        code: input.code,
        name: input.name,
        notes: input.notes ?? null,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateCostCenterInput): Promise<CostCenter | null> {
    const row = await db
      .updateTable('cost_centers')
      .set({
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.customFields !== undefined ? { custom_fields: JSON.stringify(input.customFields) } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('cost_centers').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
