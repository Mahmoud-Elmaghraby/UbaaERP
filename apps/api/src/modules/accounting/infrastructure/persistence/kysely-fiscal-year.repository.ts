import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { FiscalYearsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { FiscalYearRepository } from '../../application/ports/fiscal-year.repository';
import type {
  FiscalYear,
  FiscalYearStatus,
  CreateFiscalYearInput,
  UpdateFiscalYearInput,
} from '../../domain/fiscal-year.entity';

function toDomain(row: Selectable<FiscalYearsTable>): FiscalYear {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status as FiscalYearStatus,
    notes: row.notes,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyFiscalYearRepository implements FiscalYearRepository {
  async list(db: Kysely<TenantDatabase>): Promise<FiscalYear[]> {
    const rows = await db.selectFrom('fiscal_years').selectAll().orderBy('start_date', 'desc').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<FiscalYear | null> {
    const row = await db.selectFrom('fiscal_years').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateFiscalYearInput): Promise<FiscalYear> {
    const row = await db
      .insertInto('fiscal_years')
      .values({
        id: randomUUID(),
        name: input.name,
        start_date: input.startDate,
        end_date: input.endDate,
        notes: input.notes ?? null,
        custom_fields: JSON.stringify(input.customFields ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateFiscalYearInput): Promise<FiscalYear | null> {
    const row = await db
      .updateTable('fiscal_years')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.customFields !== undefined ? { custom_fields: JSON.stringify(input.customFields) } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async updateStatus(
    db: Kysely<TenantDatabase>,
    id: string,
    status: FiscalYearStatus,
  ): Promise<FiscalYear | null> {
    const row = await db
      .updateTable('fiscal_years')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('fiscal_years').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
