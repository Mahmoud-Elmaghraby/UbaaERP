import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { KyselyRefreshTokenRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-refresh-token.repository';
import { KyselyUserRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-user.repository';
import { OWNER_ROLE_ID } from '../../src/database/tenant/well-known-ids';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

describe('KyselyRefreshTokenRepository (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const repository = new KyselyRefreshTokenRepository();
  const users = new KyselyUserRepository();
  let userId: string;

  beforeAll(async () => {
    db = openIntegrationDb();
    const user = await users.create(db, {
      email: `rt-${uniqueSuffix()}@example.com`,
      passwordHash: 'irrelevant-for-this-test',
      fullName: 'Refresh Token Test User',
      roleId: OWNER_ROLE_ID,
      isActive: true,
    });
    userId = user.id;
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('creates a token and finds it back by its hash, not-yet-revoked', async () => {
    const tokenHash = randomUUID();
    const expiresAt = new Date(Date.now() + 60_000);

    await repository.create(db, userId, tokenHash, expiresAt);

    const found = await repository.findByHash(db, tokenHash);
    expect(found?.userId).toBe(userId);
    expect(found?.revokedAt).toBeNull();
    expect(found?.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it('findByHash() returns null for an unknown hash', async () => {
    await expect(repository.findByHash(db, randomUUID())).resolves.toBeNull();
  });

  it('revoke() sets revoked_at, making the token show up as revoked', async () => {
    const tokenHash = randomUUID();
    await repository.create(db, userId, tokenHash, new Date(Date.now() + 60_000));

    await repository.revoke(db, tokenHash);

    const found = await repository.findByHash(db, tokenHash);
    expect(found?.revokedAt).not.toBeNull();
  });

  it('revokeAllForUser() revokes every still-active token for that user, and only that user', async () => {
    const otherUser = await users.create(db, {
      email: `rt-other-${uniqueSuffix()}@example.com`,
      passwordHash: 'irrelevant',
      fullName: 'Other User',
      roleId: OWNER_ROLE_ID,
      isActive: true,
    });

    const tokenA = randomUUID();
    const tokenB = randomUUID();
    const otherToken = randomUUID();
    await repository.create(db, userId, tokenA, new Date(Date.now() + 60_000));
    await repository.create(db, userId, tokenB, new Date(Date.now() + 60_000));
    await repository.create(db, otherUser.id, otherToken, new Date(Date.now() + 60_000));

    await repository.revokeAllForUser(db, userId);

    expect((await repository.findByHash(db, tokenA))?.revokedAt).not.toBeNull();
    expect((await repository.findByHash(db, tokenB))?.revokedAt).not.toBeNull();
    expect((await repository.findByHash(db, otherToken))?.revokedAt).toBeNull(); // untouched
  });
});
