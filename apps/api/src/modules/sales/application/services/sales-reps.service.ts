import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { SalesRepDto, SaveSalesRepDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  BusinessRuleError,
  isPostgresForeignKeyViolation,
  isPostgresUniqueViolation,
} from '../../../../shared/errors/domain-errors';
import { duplicateEntity, entityNotFound } from '../../../../shared/errors/entity-errors';

/**
 * Sales representatives (المندوبين) — who a sale counts for. Plain CRUD
 * (CLAUDE.md §2.1: lookup table, no aggregate). A rep may be linked to a
 * system user; the commission percentage is stored for a later report.
 */
@Injectable()
export class SalesRepsService {
  async list(db: Kysely<TenantDatabase>): Promise<SalesRepDto[]> {
    const rows = await this.base(db).orderBy('r.is_active', 'desc').orderBy('r.name').execute();
    return rows.map(toDto);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<SalesRepDto> {
    const row = await this.base(db).where('r.id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('SALES_REP', id);
    return toDto(row);
  }

  async save(db: Kysely<TenantDatabase>, id: string | null, input: SaveSalesRepDto): Promise<SalesRepDto> {
    const values = {
      code: input.code,
      name: input.name,
      phone: input.phone?.trim() || null,
      user_id: input.userId ?? null,
      commission_percentage:
        input.commissionPercentage === null || input.commissionPercentage === undefined ? null : String(input.commissionPercentage),
      is_active: input.isActive ?? true,
    };
    const repId = id ?? randomUUID();
    try {
      if (id) {
        const updated = await db.updateTable('sales_reps').set({ ...values, updated_at: new Date() }).where('id', '=', id).executeTakeFirst();
        if (!updated.numUpdatedRows) throw entityNotFound('SALES_REP', id);
      } else {
        await db.insertInto('sales_reps').values({ id: repId, ...values }).execute();
      }
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('SALES_REP', 'code', input.code);
      if (isPostgresForeignKeyViolation(err)) {
        throw new BusinessRuleError('The selected user does not exist.', { code: 'SALES_REP.USER_NOT_FOUND' });
      }
      throw err;
    }
    return this.getById(db, repId);
  }

  /** Only a rep nothing points at; otherwise deactivate it. */
  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    try {
      const deleted = await db.deleteFrom('sales_reps').where('id', '=', id).executeTakeFirst();
      if (!deleted.numDeletedRows) throw entityNotFound('SALES_REP', id);
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new BusinessRuleError('This sales rep is used by customers or documents — deactivate it instead.', {
          code: 'SALES_REP.IN_USE',
        });
      }
      throw err;
    }
  }

  private base(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('sales_reps as r')
      .leftJoin('users as u', 'u.id', 'r.user_id')
      .selectAll('r')
      .select('u.full_name as user_name');
  }
}

/**
 * The rep a new sales document gets:
 *  - `requested` given (string) → that rep, which must exist and be active;
 *  - `requested` null → no rep;
 *  - `requested` undefined → `fallback` (the order's / customer's default), kept
 *    only while that rep is still active.
 */
export async function resolveSalesRepId(
  db: Kysely<TenantDatabase>,
  requested: string | null | undefined,
  fallback: string | null,
): Promise<string | null> {
  if (requested === null) return null;
  const id = requested ?? fallback;
  if (!id) return null;
  const rep = await db.selectFrom('sales_reps').select(['id', 'name', 'is_active']).where('id', '=', id).executeTakeFirst();
  if (requested === undefined) return rep?.is_active ? rep.id : null;
  if (!rep) throw entityNotFound('SALES_REP', id);
  if (!rep.is_active) {
    throw new BusinessRuleError(`Sales rep "${rep.name}" is inactive.`, { code: 'SALES_REP.INACTIVE', params: { name: rep.name } });
  }
  return rep.id;
}

function toDto(row: {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  user_id: string | null;
  user_name: string | null;
  commission_percentage: string | null;
  is_active: boolean;
}): SalesRepDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    phone: row.phone,
    userId: row.user_id,
    userName: row.user_name,
    commissionPercentage: row.commission_percentage === null ? null : Number(row.commission_percentage),
    isActive: row.is_active,
  };
}
