import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  USER_BRANCH_ACCESS_REPOSITORY,
  type UserBranchAccessRepository,
} from '../ports/user-branch-access.repository';
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from '../ports/audit-log.repository';
import { ConflictError, isPostgresForeignKeyViolation } from '../errors';

@Injectable()
export class UserBranchAccessService {
  constructor(
    @Inject(USER_BRANCH_ACCESS_REPOSITORY) private readonly repository: UserBranchAccessRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogs: AuditLogRepository,
  ) {}

  listForUser(db: Kysely<TenantDatabase>, userId: string): Promise<string[]> {
    return this.repository.listBranchIdsForUser(db, userId);
  }

  async setForUser(
    db: Kysely<TenantDatabase>,
    userId: string,
    branchIds: string[],
    actingUserId: string,
  ): Promise<void> {
    try {
      await this.repository.setForUser(db, userId, branchIds);
    } catch (err) {
      // branchIds are not validated against Settings' `branches` table
      // up front — Users & Permissions must not import Settings'
      // repositories directly (CLAUDE.md §2.6: modules stay decoupled,
      // no direct cross-module imports for business behavior). The FK
      // constraint on user_branch_access.branch_id catches an invalid id
      // instead; this translates that into a clear error.
      if (isPostgresForeignKeyViolation(err)) {
        throw new ConflictError('One or more branch IDs do not exist.', {
          code: 'USER_BRANCH_ACCESS.INVALID_BRANCH_IDS',
        });
      }
      throw err;
    }
    await this.auditLogs.record(db, {
      userId: actingUserId,
      action: 'user.branch_access_set',
      entityType: 'user',
      entityId: userId,
      metadata: { branchIds },
    });
  }
}
