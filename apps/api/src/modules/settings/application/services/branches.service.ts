import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { BRANCH_REPOSITORY, type BranchRepository } from '../ports/branch.repository';
import type { Branch, CreateBranchInput, UpdateBranchInput } from '../../domain/branch.entity';
import { ConflictError, NotFoundError, isPostgresUniqueViolation } from '../errors';

@Injectable()
export class BranchesService {
  constructor(@Inject(BRANCH_REPOSITORY) private readonly repository: BranchRepository) {}

  list(db: Kysely<TenantDatabase>): Promise<Branch[]> {
    return this.repository.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<Branch> {
    const branch = await this.repository.findById(db, id);
    if (!branch) throw new NotFoundError(`Branch "${id}" not found.`);
    return branch;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateBranchInput): Promise<Branch> {
    try {
      return await this.repository.create(db, input);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(`A branch with code "${input.code}" already exists.`);
      }
      throw err;
    }
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateBranchInput): Promise<Branch> {
    try {
      const updated = await this.repository.update(db, id, input);
      if (!updated) throw new NotFoundError(`Branch "${id}" not found.`);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(`A branch with code "${input.code}" already exists.`);
      }
      throw err;
    }
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const deleted = await this.repository.delete(db, id);
    if (!deleted) throw new NotFoundError(`Branch "${id}" not found.`);
  }
}
