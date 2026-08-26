import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ApprovalChainRepository } from '../../application/ports/approval-chain.repository';

export class KyselyApprovalChainRepository implements ApprovalChainRepository {
  async getManagerId(db: Kysely<TenantDatabase>, userId: string): Promise<string | null> {
    const row = await db
      .selectFrom('approval_chains')
      .select('manager_id')
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row?.manager_id ?? null;
  }

  async setManager(db: Kysely<TenantDatabase>, userId: string, managerId: string | null): Promise<void> {
    const existing = await db
      .selectFrom('approval_chains')
      .select('id')
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (existing) {
      await db
        .updateTable('approval_chains')
        .set({ manager_id: managerId, updated_at: new Date() })
        .where('user_id', '=', userId)
        .execute();
    } else {
      await db
        .insertInto('approval_chains')
        .values({ id: randomUUID(), user_id: userId, manager_id: managerId })
        .execute();
    }
  }
}
