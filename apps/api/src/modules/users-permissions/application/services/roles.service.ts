import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { ROLE_REPOSITORY, type RoleRepository } from '../ports/role.repository';
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from '../ports/audit-log.repository';
import type { CreateRoleInput, Role, UpdateRoleInput } from '../../domain/role.entity';
import { ConflictError, isPostgresForeignKeyViolation, isPostgresUniqueViolation } from '../errors';
import { entityNotFound } from '../../../../shared/errors/entity-errors';

@Injectable()
export class RolesService {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly repository: RoleRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogs: AuditLogRepository,
  ) {}

  list(db: Kysely<TenantDatabase>): Promise<Role[]> {
    return this.repository.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<Role> {
    const role = await this.repository.findById(db, id);
    if (!role) throw entityNotFound('ROLE', id);
    return role;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateRoleInput, actingUserId: string): Promise<Role> {
    try {
      const role = await this.repository.create(db, input);
      await this.auditLogs.record(db, {
        userId: actingUserId,
        action: 'role.created',
        entityType: 'role',
        entityId: role.id,
        metadata: { name: role.name, permissionKeys: role.permissionKeys },
      });
      return role;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(`A role named "${input.name}" already exists.`, {
          code: 'ROLE.DUPLICATE_NAME',
          params: { name: input.name },
        });
      }
      throw err;
    }
  }

  async update(
    db: Kysely<TenantDatabase>,
    id: string,
    input: UpdateRoleInput,
    actingUserId: string,
  ): Promise<Role> {
    try {
      const role = await this.repository.update(db, id, input);
      if (!role) throw entityNotFound('ROLE', id);
      await this.auditLogs.record(db, {
        userId: actingUserId,
        action: 'role.updated',
        entityType: 'role',
        entityId: role.id,
        metadata: { ...input },
      });
      return role;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new ConflictError(`A role named "${input.name}" already exists.`, {
          code: 'ROLE.DUPLICATE_NAME',
          params: { name: input.name ?? '' },
        });
      }
      throw err;
    }
  }

  async delete(db: Kysely<TenantDatabase>, id: string, actingUserId: string): Promise<void> {
    const role = await this.repository.findById(db, id);
    if (!role) throw entityNotFound('ROLE', id);
    if (role.isSystem) {
      throw new ConflictError(`"${role.name}" is a system role and cannot be deleted.`, {
        code: 'ROLE.CANNOT_DELETE_SYSTEM',
        params: { name: role.name },
      });
    }

    try {
      const deleted = await this.repository.delete(db, id);
      if (!deleted) throw entityNotFound('ROLE', id);
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new ConflictError(
          `Role "${role.name}" is still assigned to one or more users and cannot be deleted.`,
          { code: 'ROLE.STILL_ASSIGNED', params: { name: role.name } },
        );
      }
      throw err;
    }

    await this.auditLogs.record(db, {
      userId: actingUserId,
      action: 'role.deleted',
      entityType: 'role',
      entityId: id,
      metadata: { name: role.name },
    });
  }
}
