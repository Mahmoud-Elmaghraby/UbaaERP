import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { APPROVAL_CHAIN_REPOSITORY, type ApprovalChainRepository } from '../ports/approval-chain.repository';
import { USER_REPOSITORY, type UserRepository } from '../ports/user.repository';
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from '../ports/audit-log.repository';
import { ConflictError } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';

@Injectable()
export class ApprovalChainsService {
  constructor(
    @Inject(APPROVAL_CHAIN_REPOSITORY) private readonly repository: ApprovalChainRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogs: AuditLogRepository,
  ) {}

  getManagerId(db: Kysely<TenantDatabase>, userId: string): Promise<string | null> {
    return this.repository.getManagerId(db, userId);
  }

  async setManager(
    db: Kysely<TenantDatabase>,
    userId: string,
    managerId: string | null,
    actingUserId: string,
  ): Promise<void> {
    if (managerId === userId) {
      throw new ConflictError('A user cannot be their own manager.', {
        code: 'USER.CANNOT_BE_OWN_MANAGER',
      });
    }
    const user = await this.users.findById(db, userId);
    if (!user) throw entityNotFound('USER', userId);

    if (managerId) {
      const manager = await this.users.findById(db, managerId);
      if (!manager) throw entityNotFound('USER', managerId);
    }

    await this.repository.setManager(db, userId, managerId);
    await this.auditLogs.record(db, {
      userId: actingUserId,
      action: 'user.manager_set',
      entityType: 'user',
      entityId: userId,
      metadata: { managerId },
    });
  }
}
