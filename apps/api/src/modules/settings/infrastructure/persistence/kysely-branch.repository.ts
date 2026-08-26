import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { BranchesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { BranchRepository } from '../../application/ports/branch.repository';
import type { Branch, CreateBranchInput, UpdateBranchInput } from '../../domain/branch.entity';

function toDomain(row: Selectable<BranchesTable>): Branch {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    isActive: row.is_active,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyBranchRepository implements BranchRepository {
  async list(db: Kysely<TenantDatabase>): Promise<Branch[]> {
    const rows = await db.selectFrom('branches').selectAll().orderBy('name').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<Branch | null> {
    const row = await db.selectFrom('branches').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findByCode(db: Kysely<TenantDatabase>, code: string): Promise<Branch | null> {
    const row = await db.selectFrom('branches').selectAll().where('code', '=', code).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateBranchInput): Promise<Branch> {
    const row = await db
      .insertInto('branches')
      .values({
        id: randomUUID(),
        name: input.name,
        code: input.code,
        address: input.address ?? null,
        is_active: input.isActive ?? true,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateBranchInput): Promise<Branch | null> {
    const row = await db
      .updateTable('branches')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        ...(input.customFields !== undefined
          ? { custom_fields: JSON.stringify(input.customFields) }
          : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('branches').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
