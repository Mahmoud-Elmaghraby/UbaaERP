import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type {
  CreateTreasuryCategoryDto,
  TreasuryCategoryDto,
  TreasuryCategoryKindDto,
  UpdateTreasuryCategoryDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { BusinessRuleError, isPostgresUniqueViolation } from '../../../shared/errors/domain-errors';
import { duplicateEntity, entityNotFound } from '../../../shared/errors/entity-errors';

/** Expense and income items (بنود المصروفات والإيرادات) a voucher is booked against. Plain CRUD. */
@Injectable()
export class TreasuryCategoriesService {
  async list(db: Kysely<TenantDatabase>, kind?: TreasuryCategoryKindDto): Promise<TreasuryCategoryDto[]> {
    let query = db.selectFrom('treasury_categories').selectAll();
    if (kind) query = query.where('kind', '=', kind);
    const rows = await query.orderBy('kind').orderBy('name').execute();
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as TreasuryCategoryKindDto,
      name: r.name,
      chartOfAccountId: r.chart_of_account_id,
      isActive: r.is_active,
    }));
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<TreasuryCategoryDto> {
    const row = await db.selectFrom('treasury_categories').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('TREASURY_CATEGORY', id);
    return { id: row.id, kind: row.kind as TreasuryCategoryKindDto, name: row.name, chartOfAccountId: row.chart_of_account_id, isActive: row.is_active };
  }

  async create(db: Kysely<TenantDatabase>, input: CreateTreasuryCategoryDto): Promise<TreasuryCategoryDto> {
    const id = randomUUID();
    try {
      await db
        .insertInto('treasury_categories')
        .values({ id, kind: input.kind, name: input.name, chart_of_account_id: input.chartOfAccountId ?? null })
        .execute();
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('TREASURY_CATEGORY', 'name', input.name);
      throw err;
    }
    return this.getById(db, id);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateTreasuryCategoryDto): Promise<TreasuryCategoryDto> {
    await this.getById(db, id);
    try {
      await db
        .updateTable('treasury_categories')
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.chartOfAccountId !== undefined ? { chart_of_account_id: input.chartOfAccountId } : {}),
          ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .execute();
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('TREASURY_CATEGORY', 'name', input.name);
      throw err;
    }
    return this.getById(db, id);
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const category = await this.getById(db, id);
    const used = await db.selectFrom('treasury_vouchers').select('id').where('category_id', '=', id).limit(1).executeTakeFirst();
    if (used) {
      throw new BusinessRuleError(`Item "${category.name}" is used by vouchers.`, {
        code: 'TREASURY_CATEGORY.IN_USE',
        params: { name: category.name },
      });
    }
    await db.deleteFrom('treasury_categories').where('id', '=', id).execute();
  }
}
