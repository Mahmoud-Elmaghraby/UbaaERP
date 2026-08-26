import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { Permission } from '../../domain/permission.entity';

export interface PermissionRepository {
  list(db: Kysely<TenantDatabase>): Promise<Permission[]>;
}

export const PERMISSION_REPOSITORY = Symbol('PERMISSION_REPOSITORY');
