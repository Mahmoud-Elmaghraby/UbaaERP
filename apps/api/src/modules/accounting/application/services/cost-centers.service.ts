import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { COST_CENTER_REPOSITORY, type CostCenterRepository } from '../ports/cost-center.repository';
import type {
  CostCenter,
  CostCenterFilters,
  CreateCostCenterInput,
  UpdateCostCenterInput,
} from '../../domain/cost-center.entity';
import { isPostgresUniqueViolation } from '../errors';
import { duplicateEntity, entityNotFound } from '../../../../shared/errors/entity-errors';

/**
 * Cost Centers (CLAUDE.md §10 — step 5, Accounting, Stage 4). Simpler
 * than ChartOfAccountsService — no tree, no is_system, no postability
 * check: a cost center is a flat, always-referenceable tag. Deletion
 * needs no "still referenced" guard the way ChartOfAccountsService's
 * does, because journal_entry_lines.cost_center_id is ON DELETE SET
 * NULL (migration 0056) — deleting a cost center just un-tags any line
 * that used it, it never blocks or cascades.
 */
@Injectable()
export class CostCentersService {
  constructor(@Inject(COST_CENTER_REPOSITORY) private readonly repository: CostCenterRepository) {}

  list(db: Kysely<TenantDatabase>, filters?: CostCenterFilters): Promise<CostCenter[]> {
    return this.repository.list(db, filters);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<CostCenter> {
    const costCenter = await this.repository.findById(db, id);
    if (!costCenter) throw entityNotFound('COST_CENTER', id);
    return costCenter;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateCostCenterInput): Promise<CostCenter> {
    try {
      return await this.repository.create(db, input);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw duplicateEntity('COST_CENTER', 'code', input.code);
      }
      throw err;
    }
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateCostCenterInput): Promise<CostCenter> {
    await this.getById(db, id);
    try {
      const updated = await this.repository.update(db, id, input);
      if (!updated) throw entityNotFound('COST_CENTER', id);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw duplicateEntity('COST_CENTER', 'code', input.code);
      }
      throw err;
    }
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    await this.getById(db, id);
    const deleted = await this.repository.delete(db, id);
    if (!deleted) throw entityNotFound('COST_CENTER', id);
  }
}
