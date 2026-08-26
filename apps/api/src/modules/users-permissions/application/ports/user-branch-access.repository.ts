import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';

export interface UserBranchAccessRepository {
  listBranchIdsForUser(db: Kysely<TenantDatabase>, userId: string): Promise<string[]>;
  /** Replace-all: deletes the user's existing rows, then inserts the new
   * set in one call — simplest correct semantics for a small access list,
   * matching how BranchesService's siblings handle similar small sets. */
  setForUser(db: Kysely<TenantDatabase>, userId: string, branchIds: string[]): Promise<void>;
}

export const USER_BRANCH_ACCESS_REPOSITORY = Symbol('USER_BRANCH_ACCESS_REPOSITORY');
