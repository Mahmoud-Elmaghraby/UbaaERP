import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { CreateRoleInput, Role, UpdateRoleInput } from '../../domain/role.entity';

export interface RoleRepository {
  list(db: Kysely<TenantDatabase>): Promise<Role[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<Role | null>;
  create(db: Kysely<TenantDatabase>, input: CreateRoleInput): Promise<Role>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateRoleInput): Promise<Role | null>;
  /** No-ops (returns false) for a system role — see the is_system guard
   * in KyselyRoleRepository.delete; RolesService checks isSystem first
   * anyway, so this is defense in depth, not the primary guard. */
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');
