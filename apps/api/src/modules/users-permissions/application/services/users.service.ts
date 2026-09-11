import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { USER_REPOSITORY, type UserRepository } from '../ports/user.repository';
import { ROLE_REPOSITORY, type RoleRepository } from '../ports/role.repository';
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from '../ports/audit-log.repository';
import { REFRESH_TOKEN_REPOSITORY, type RefreshTokenRepository } from '../ports/refresh-token.repository';
import type { CreateUserInput, UpdateUserInput, User } from '../../domain/user.entity';
import { ConflictError, isPostgresUniqueViolation } from '../errors';
import { duplicateEntity, entityNotFound } from '../../../../shared/errors/entity-errors';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repository: UserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogs: AuditLogRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<User[]> {
    return this.repository.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<User> {
    const user = await this.repository.findById(db, id);
    if (!user) throw entityNotFound('USER', id);
    return user;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateUserInput, actingUserId: string): Promise<User> {
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new ConflictError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, {
        code: 'USER.PASSWORD_TOO_SHORT',
        params: { minLength: MIN_PASSWORD_LENGTH },
      });
    }
    // roleId is validated here (not left to the DB's FK constraint)
    // because RoleRepository lives in this same module — no cross-module
    // boundary crossed, unlike branch_id validation (see
    // UserBranchAccessService's comment on that trade-off).
    const role = await this.roles.findById(db, input.roleId);
    if (!role) throw entityNotFound('ROLE', input.roleId);

    const email = input.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    try {
      const user = await this.repository.create(db, {
        email,
        passwordHash,
        fullName: input.fullName,
        roleId: input.roleId,
        isActive: input.isActive ?? true,
      });
      await this.auditLogs.record(db, {
        userId: actingUserId,
        action: 'user.created',
        entityType: 'user',
        entityId: user.id,
        metadata: { email: user.email, roleId: user.roleId },
      });
      return user;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw duplicateEntity('USER', 'email', email);
      }
      throw err;
    }
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateUserInput,
    actingUserId: string,
  ): Promise<User> {
    if (input.roleId !== undefined) {
      const role = await this.roles.findById(db, input.roleId);
      if (!role) throw entityNotFound('ROLE', input.roleId);
    }
    if (input.isActive === false && id === actingUserId) {
      throw new ConflictError('You cannot deactivate your own account.', {
        code: 'USER.CANNOT_DEACTIVATE_SELF',
      });
    }

    const user = await this.repository.update(db, id, input);
    if (!user) throw entityNotFound('USER', id);

    await this.auditLogs.record(db, {
      userId: actingUserId,
      action: 'user.updated',
      entityType: 'user',
      entityId: user.id,
      metadata: { ...input },
    });

    // Deactivation alone does NOT invalidate a still-valid access token
    // already in someone's hands (permissions/active-status are only
    // re-checked on refresh — see PermissionsGuard's and AuthService's
    // own comments on that bounded staleness window). Revoking every
    // refresh token here closes the other half of the gap: the user
    // cannot silently stay logged in past their current access token's
    // TTL by refreshing, and this is also the real incident-response
    // action ("kick this user out now") an Owner needs when deactivating
    // someone, not just a side-effect worth mentioning.
    if (input.isActive === false) {
      await this.refreshTokens.revokeAllForUser(db, id);
      await this.auditLogs.record(db, {
        userId: actingUserId,
        action: 'user.sessions_revoked',
        entityType: 'user',
        entityId: user.id,
        metadata: { reason: 'deactivated' },
      });
    }
    return user;
  }

  /**
   * Force-logout: revokes every refresh token currently issued to a
   * user, without changing anything else about their account. Two
   * callers use this: an admin acting on another user (suspected
   * compromise, offboarding in progress but not yet a full
   * deactivation) via UsersController, and a user revoking their own
   * other sessions ("log out everywhere") via the /me variant.
   */
  async revokeSessions(db: Kysely<TenantDatabase>, targetUserId: string, actingUserId: string): Promise<void> {
    const user = await this.repository.findById(db, targetUserId);
    if (!user) throw entityNotFound('USER', targetUserId);

    await this.refreshTokens.revokeAllForUser(db, targetUserId);
    await this.auditLogs.record(db, {
      userId: actingUserId,
      action: 'user.sessions_revoked',
      entityType: 'user',
      entityId: targetUserId,
      metadata: { reason: actingUserId === targetUserId ? 'self_requested' : 'admin_requested' },
    });
  }

  async changeOwnPassword(
    db: Kysely<TenantDatabase>,
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new ConflictError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, {
        code: 'USER.PASSWORD_TOO_SHORT',
        params: { minLength: MIN_PASSWORD_LENGTH },
      });
    }
    const user = await this.repository.findById(db, userId);
    if (!user) throw entityNotFound('USER', userId);

    const authRecord = await this.repository.findByEmailForAuth(db, user.email);
    if (!authRecord) throw entityNotFound('USER', userId);

    const matches = await bcrypt.compare(currentPassword, authRecord.passwordHash);
    if (!matches) {
      throw new ConflictError('Current password is incorrect.', {
        code: 'USER.CURRENT_PASSWORD_INCORRECT',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.repository.updatePasswordHash(db, userId, passwordHash);
    await this.auditLogs.record(db, {
      userId,
      action: 'user.password_changed',
      entityType: 'user',
      entityId: userId,
      metadata: {},
    });
  }
}
