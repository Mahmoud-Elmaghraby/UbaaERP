import type { Kysely, Selectable } from 'kysely';
import type { PermissionsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PermissionRepository } from '../../application/ports/permission.repository';
import type { Permission } from '../../domain/permission.entity';

function toDomain(row: Selectable<PermissionsTable>): Permission {
  return {
    id: row.id,
    key: row.key,
    description: row.description,
    createdAt: row.created_at,
  };
}

export class KyselyPermissionRepository implements PermissionRepository {
  async list(db: Kysely<TenantDatabase>): Promise<Permission[]> {
    const rows = await db.selectFrom('permissions').selectAll().orderBy('key').execute();
    return rows.map(toDomain);
  }
}
