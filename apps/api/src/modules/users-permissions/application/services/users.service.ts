import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { USER_REPOSITORY, type UserRepository } from '../ports/user.repository';
import { ROLE_REPOSITORY, type RoleRepository } from '../ports/role.repository';
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from '../ports/audit-log.repository';
import type { CreateUserInput, UpdateUserInput, User } from '../../domain/user.entity';
import { ConflictError, NotFoundError, isPostgresUniqueViolation } from '../errors';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repository: UserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogs: AuditLogRepository,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<User[]> {
    return this.repository.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<User> {
    const user = await this.repository.findById(db, id);
    if (!user) throw new NotFoundError(`User "${id}" not found.`);
    return user;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateUserInput, actingUserId: string): Promise<User> {
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new ConflictError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    // roleId is validated here (not left to the DB's FK constraint)
    // because RoleRepository lives in this same module — no cross-module
    // boundary crossed, unlike branch_id validation (see
    // UserBranchAccessService's comment on that trade-off).
    const role = await this.roles.findById(db, input.roleId);
    if (!role) throw new NotFoundError(`Role "${input.roleId}" not found.`);

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
        throw new ConflictError(`A user with email "${email}" already exists.`);
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
      if (!role) throw new NotFoundError(`Role "${input.roleId}" not found.`);
    }
    if (input.isActive === false && id === actingUserId) {
      throw new ConflictError('You cannot deactivate your own account.');
    }

    const user = await this.repository.update(db, id, input);
    if (!user) throw new NotFoundError(`User "${id}" not found.`);

    await this.auditLogs.record(db, {
      userId: actingUserId,
      action: 'user.updated',
      entityType: 'user',
      entityId: user.id,
      metadata: { ...input },
    });
    return user;
  }

  async changeOwnPassword(
    db: Kysely<TenantDatabase>,
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new ConflictError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    const user = await this.repository.findById(db, userId);
    if (!user) throw new NotFoundError(`User "${userId}" not found.`);

    const authRecord = await this.repository.findByEmailForAuth(db, user.email);
    if (!authRecord) throw new NotFoundError(`User "${userId}" not found.`);

    const matches = await bcrypt.compare(currentPassword, authRecord.passwordHash);
    if (!matches) throw new ConflictError('Current password is incorrect.');

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
