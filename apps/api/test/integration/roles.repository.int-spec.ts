import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { KyselyRoleRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-role.repository';
import { KyselyUserRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-user.repository';
import { OWNER_ROLE_ID } from '../../src/database/tenant/well-known-ids';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

describe('KyselyRoleRepository (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const repository = new KyselyRoleRepository();
  const users = new KyselyUserRepository();

  beforeAll(() => {
    db = openIntegrationDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('creates a role and attaches the given permission keys, ignoring unknown keys', async () => {
    const created = await repository.create(db, {
      name: `Cashier-${uniqueSuffix()}`,
      permissionKeys: ['settings.manage', 'not-a-real-permission-key'],
    });

    expect(created.permissionKeys).toEqual(['settings.manage']);
    expect(created.isSystem).toBe(false);
  });

  it('findById() hydrates permissionKeys from the join table', async () => {
    const created = await repository.create(db, {
      name: `Manager-${uniqueSuffix()}`,
      permissionKeys: ['users.manage', 'roles.manage'],
    });

    const found = await repository.findById(db, created.id);
    expect(found?.permissionKeys.sort()).toEqual(['roles.manage', 'users.manage']);
  });

  it('findById() returns null for a nonexistent id', async () => {
    await expect(repository.findById(db, '00000000-0000-0000-0000-000000000000')).resolves.toBeNull();
  });

  it('enforces uniqueness on role name', async () => {
    const name = `Dup-Role-${uniqueSuffix()}`;
    await repository.create(db, { name, permissionKeys: [] });
    await expect(repository.create(db, { name, permissionKeys: [] })).rejects.toMatchObject({ code: '23505' });
  });

  it('update() replaces the full permission set (not a merge)', async () => {
    const created = await repository.create(db, {
      name: `Replaceable-${uniqueSuffix()}`,
      permissionKeys: ['settings.manage', 'users.manage'],
    });

    const updated = await repository.update(db, created.id, { permissionKeys: ['audit_logs.view'] });
    expect(updated?.permissionKeys).toEqual(['audit_logs.view']);
  });

  it('update() with permissionKeys omitted leaves the existing permission set untouched', async () => {
    const created = await repository.create(db, {
      name: `Untouched-${uniqueSuffix()}`,
      permissionKeys: ['settings.manage'],
    });

    const updated = await repository.update(db, created.id, { name: 'Renamed Only' });
    expect(updated?.permissionKeys).toEqual(['settings.manage']);
  });

  it('update() returns null for a nonexistent id', async () => {
    await expect(repository.update(db, '00000000-0000-0000-0000-000000000000', { name: 'X' })).resolves.toBeNull();
  });

  it('delete() is a no-op (returns false, does not throw) for a system role — defense in depth below the service layer', async () => {
    await expect(repository.delete(db, OWNER_ROLE_ID)).resolves.toBe(false);
    // Still there afterwards.
    await expect(repository.findById(db, OWNER_ROLE_ID)).resolves.not.toBeNull();
  });

  it('delete() removes a normal, unreferenced role', async () => {
    const created = await repository.create(db, { name: `Deletable-${uniqueSuffix()}`, permissionKeys: [] });
    await expect(repository.delete(db, created.id)).resolves.toBe(true);
    await expect(repository.findById(db, created.id)).resolves.toBeNull();
  });

  it('delete() raises a real foreign-key violation when a user still references the role', async () => {
    const role = await repository.create(db, { name: `Referenced-${uniqueSuffix()}`, permissionKeys: [] });
    await users.create(db, {
      email: `referenced-role-user-${uniqueSuffix()}@example.com`,
      passwordHash: 'irrelevant',
      fullName: 'Referencing User',
      roleId: role.id,
      isActive: true,
    });

    await expect(repository.delete(db, role.id)).rejects.toMatchObject({ code: '23503' });
  });

  it('list() includes newly created roles alongside the seeded Owner role', async () => {
    const created = await repository.create(db, { name: `Listed-${uniqueSuffix()}`, permissionKeys: [] });
    const all = await repository.list(db);
    expect(all.map((r) => r.id)).toEqual(expect.arrayContaining([OWNER_ROLE_ID, created.id]));
  });
});
