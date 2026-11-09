import { randomUUID } from 'node:crypto';
import type { Kysely, Selectable } from 'kysely';
import type { RolesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { RoleRepository } from '../../application/ports/role.repository';
import type { CreateRoleInput, Role, UpdateRoleInput } from '../../domain/role.entity';

/** Batched: one query for all requested role ids' permission keys,
 * instead of N+1 queries per role. */
async function loadPermissionKeys(
  db: Kysely<TenantDatabase>,
  roleIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (roleIds.length === 0) return map;

  const rows = await db
    .selectFrom('role_permissions')
    .innerJoin('permissions', 'permissions.id', 'role_permissions.permission_id')
    .select(['role_permissions.role_id as roleId', 'permissions.key as key'])
    .where('role_permissions.role_id', 'in', roleIds)
    .execute();

  for (const row of rows) {
    const existing = map.get(row.roleId) ?? [];
    existing.push(row.key);
    map.set(row.roleId, existing);
  }
  return map;
}

/** Users per role, for the given role ids. */
async function loadUserCounts(db: Kysely<TenantDatabase>, roleIds: string[]): Promise<Map<string, number>> {
  if (roleIds.length === 0) return new Map();
  const rows = await db
    .selectFrom('users')
    .select(['role_id', (eb) => eb.fn.countAll<string>().as('n')])
    .where('role_id', 'in', roleIds)
    .groupBy('role_id')
    .execute();
  return new Map(rows.map((r) => [r.role_id, Number(r.n)]));
}

function toDomain(row: Selectable<RolesTable>, permissionKeys: string[], userCount = 0): Role {
  return {
    id: row.id,
    name: row.name,
    isSystem: row.is_system,
    permissionKeys,
    userCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyRoleRepository implements RoleRepository {
  async list(db: Kysely<TenantDatabase>): Promise<Role[]> {
    const rows = await db.selectFrom('roles').selectAll().orderBy('name').execute();
    const ids = rows.map((r) => r.id);
    const [keysByRole, counts] = await Promise.all([loadPermissionKeys(db, ids), loadUserCounts(db, ids)]);
    return rows.map((r) => toDomain(r, keysByRole.get(r.id) ?? [], counts.get(r.id) ?? 0));
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<Role | null> {
    const row = await db.selectFrom('roles').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) return null;
    const [keysByRole, counts] = await Promise.all([loadPermissionKeys(db, [row.id]), loadUserCounts(db, [row.id])]);
    return toDomain(row, keysByRole.get(row.id) ?? [], counts.get(row.id) ?? 0);
  }

  async create(db: Kysely<TenantDatabase>, input: CreateRoleInput): Promise<Role> {
    const id = randomUUID();
    const row = await db
      .insertInto('roles')
      .values({ id, name: input.name, is_system: false })
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.setPermissions(db, id, input.permissionKeys);
    // Return what was actually persisted, not the raw input — setPermissions()
    // silently drops unknown permission keys (see its `where key in ...` join
    // against the real permissions table), so echoing input.permissionKeys
    // back here would misreport keys that were never written. Mirrors
    // update()'s post-write re-fetch below for the same reason.
    const keysByRole = await loadPermissionKeys(db, [id]);
    return toDomain(row, keysByRole.get(id) ?? []);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateRoleInput): Promise<Role | null> {
    const row = await db
      .updateTable('roles')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    if (!row) return null;

    if (input.permissionKeys !== undefined) {
      await this.setPermissions(db, id, input.permissionKeys);
    }
    const [keysByRole, counts] = await Promise.all([loadPermissionKeys(db, [id]), loadUserCounts(db, [id])]);
    return toDomain(row, keysByRole.get(id) ?? [], counts.get(id) ?? 0);
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db
      .deleteFrom('roles')
      .where('id', '=', id)
      .where('is_system', '=', false)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  private async setPermissions(
    db: Kysely<TenantDatabase>,
    roleId: string,
    permissionKeys: string[],
  ): Promise<void> {
    await db.deleteFrom('role_permissions').where('role_id', '=', roleId).execute();
    if (permissionKeys.length === 0) return;

    const permissionRows = await db
      .selectFrom('permissions')
      .select(['id', 'key'])
      .where('key', 'in', permissionKeys)
      .execute();
    if (permissionRows.length === 0) return;

    await db
      .insertInto('role_permissions')
      .values(permissionRows.map((p) => ({ role_id: roleId, permission_id: p.id })))
      .execute();
  }
}
