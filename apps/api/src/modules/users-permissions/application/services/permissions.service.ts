import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { PERMISSION_REPOSITORY, type PermissionRepository } from '../ports/permission.repository';
import type { Permission } from '../../domain/permission.entity';

@Injectable()
export class PermissionsService {
  constructor(@Inject(PERMISSION_REPOSITORY) private readonly repository: PermissionRepository) {}

  list(db: Kysely<TenantDatabase>): Promise<Permission[]> {
    return this.repository.list(db);
  }
}
