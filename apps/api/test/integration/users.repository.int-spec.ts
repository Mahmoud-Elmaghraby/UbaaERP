import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { KyselyUserRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-user.repository';
import { OWNER_ROLE_ID } from '../../src/database/tenant/well-known-ids';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

describe('KyselyUserRepository (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const repository = new KyselyUserRepository();

  beforeAll(() => {
    db = openIntegrationDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('creates a user and reads it back without exposing passwordHash through findById()', async () => {
    const email = `create-${uniqueSuffix()}@example.com`;
    const created = await repository.create(db, {
      email,
      passwordHash: 'super-secret-hash',
      fullName: 'Created User',
      roleId: OWNER_ROLE_ID,
      isActive: true,
    });

    expect((created as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();

    const found = await repository.findById(db, created.id);
    expect(found).toEqual(created);
  });

  it('findByEmailForAuth() is the one read path that DOES return passwordHash', async () => {
    const email = `auth-${uniqueSuffix()}@example.com`;
    await repository.create(db, {
      email,
      passwordHash: 'super-secret-hash',
      fullName: 'Auth User',
      roleId: OWNER_ROLE_ID,
      isActive: true,
    });

    const found = await repository.findByEmailForAuth(db, email);
    expect(found?.passwordHash).toBe('super-secret-hash');
  });

  it('findByEmailForAuth() returns null for an unknown email', async () => {
    await expect(repository.findByEmailForAuth(db, `no-such-user-${uniqueSuffix()}@example.com`)).resolves.toBeNull();
  });

  it('enforces uniqueness on email', async () => {
    const email = `dup-${uniqueSuffix()}@example.com`;
    await repository.create(db, {
      email,
      passwordHash: 'x',
      fullName: 'First',
      roleId: OWNER_ROLE_ID,
      isActive: true,
    });

    await expect(
      repository.create(db, { email, passwordHash: 'y', fullName: 'Second', roleId: OWNER_ROLE_ID, isActive: true }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects an unknown roleId with a real foreign-key violation', async () => {
    await expect(
      repository.create(db, {
        email: `badrole-${uniqueSuffix()}@example.com`,
        passwordHash: 'x',
        fullName: 'Bad Role',
        roleId: '00000000-0000-0000-0000-000000000000',
        isActive: true,
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('update() changes fullName/isActive without needing/touching the password', async () => {
    const created = await repository.create(db, {
      email: `update-${uniqueSuffix()}@example.com`,
      passwordHash: 'original-hash',
      fullName: 'Original Name',
      roleId: OWNER_ROLE_ID,
      isActive: true,
    });

    const updated = await repository.update(db, created.id, { fullName: 'New Name', isActive: false });
    expect(updated?.fullName).toBe('New Name');
    expect(updated?.isActive).toBe(false);

    const authRecord = await repository.findByEmailForAuth(db, created.email);
    expect(authRecord?.passwordHash).toBe('original-hash'); // untouched by update()
  });

  it('update() returns null for a nonexistent id', async () => {
    await expect(repository.update(db, '00000000-0000-0000-0000-000000000000', { fullName: 'X' })).resolves.toBeNull();
  });

  it('updatePasswordHash() changes only the hash, leaving other fields untouched', async () => {
    const created = await repository.create(db, {
      email: `pwchange-${uniqueSuffix()}@example.com`,
      passwordHash: 'old-hash',
      fullName: 'Password Change User',
      roleId: OWNER_ROLE_ID,
      isActive: true,
    });

    await repository.updatePasswordHash(db, created.id, 'new-hash');

    const authRecord = await repository.findByEmailForAuth(db, created.email);
    expect(authRecord?.passwordHash).toBe('new-hash');
    expect(authRecord?.fullName).toBe('Password Change User'); // untouched by updatePasswordHash()
  });

  it('list() is ordered by full_name and includes newly created users', async () => {
    const nameA = `AAA-User-${uniqueSuffix()}`;
    const nameB = `ZZZ-User-${uniqueSuffix()}`;
    await repository.create(db, { email: `${uniqueSuffix()}@example.com`, passwordHash: 'x', fullName: nameB, roleId: OWNER_ROLE_ID, isActive: true });
    await repository.create(db, { email: `${uniqueSuffix()}@example.com`, passwordHash: 'x', fullName: nameA, roleId: OWNER_ROLE_ID, isActive: true });

    const all = await repository.list(db);
    const names = all.map((u) => u.fullName);
    expect(names.indexOf(nameA)).toBeLessThan(names.indexOf(nameB));
  });
});
