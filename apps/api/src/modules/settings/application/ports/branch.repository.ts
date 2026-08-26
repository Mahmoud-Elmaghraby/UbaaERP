import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { Branch, CreateBranchInput, UpdateBranchInput } from '../../domain/branch.entity';

export interface BranchRepository {
  list(db: Kysely<TenantDatabase>): Promise<Branch[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<Branch | null>;
  findByCode(db: Kysely<TenantDatabase>, code: string): Promise<Branch | null>;
  create(db: Kysely<TenantDatabase>, input: CreateBranchInput): Promise<Branch>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateBranchInput): Promise<Branch | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const BRANCH_REPOSITORY = Symbol('BRANCH_REPOSITORY');
