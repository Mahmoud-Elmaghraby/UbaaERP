import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { UserBranchAccessRepository } from '../../application/ports/user-branch-access.repository';

export class KyselyUserBranchAccessRepository implements UserBranchAccessRepository {
  async listBranchIdsForUser(db: Kysely<TenantDatabase>, userId: string): Promise<string[]> {
    const rows = await db
      .selectFrom('user_branch_access')
      .select('branch_id')
      .where('user_id', '=', userId)
      .execute();
    return rows.map((r) => r.branch_id);
  }

  async setForUser(db: Kysely<TenantDatabase>, userId: string, branchIds: string[]): Promise<void> {
    await db.deleteFrom('user_branch_access').where('user_id', '=', userId).execute();
    if (branchIds.length === 0) return;
    await db
      .insertInto('user_branch_access')
      .values(branchIds.map((branchId) => ({ user_id: userId, branch_id: branchId })))
      .execute();
  }
}
