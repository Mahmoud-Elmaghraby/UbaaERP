import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { UnitsOfMeasureTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { UnitOfMeasureRepository } from '../../application/ports/unit-of-measure.repository';
import type {
  UnitOfMeasure,
  CreateUnitOfMeasureInput,
  UpdateUnitOfMeasureInput,
} from '../../domain/unit-of-measure.entity';

function toDomain(row: Selectable<UnitsOfMeasureTable>): UnitOfMeasure {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    baseUnitId: row.base_unit_id,
    conversionFactor: Number(row.conversion_factor),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyUnitOfMeasureRepository implements UnitOfMeasureRepository {
  async list(db: Kysely<TenantDatabase>): Promise<UnitOfMeasure[]> {
    const rows = await db.selectFrom('units_of_measure').selectAll().orderBy('name').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<UnitOfMeasure | null> {
    const row = await db.selectFrom('units_of_measure').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateUnitOfMeasureInput): Promise<UnitOfMeasure> {
    const row = await db
      .insertInto('units_of_measure')
      .values({
        id: randomUUID(),
        name: input.name,
        symbol: input.symbol,
        base_unit_id: input.baseUnitId ?? null,
        conversion_factor: String(input.conversionFactor ?? 1),
        is_active: input.isActive ?? true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateUnitOfMeasureInput,
  ): Promise<UnitOfMeasure | null> {
    const row = await db
      .updateTable('units_of_measure')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
        ...(input.baseUnitId !== undefined ? { base_unit_id: input.baseUnitId } : {}),
        ...(input.conversionFactor !== undefined ? { conversion_factor: String(input.conversionFactor) } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('units_of_measure').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
