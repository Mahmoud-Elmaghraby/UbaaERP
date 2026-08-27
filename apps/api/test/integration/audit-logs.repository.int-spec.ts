import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { KyselyAuditLogRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-audit-log.repository';
import { KyselyUserRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-user.repository';
import { OWNER_ROLE_ID } from '../../src/database/tenant/well-known-ids';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

describe('KyselyAuditLogRepository (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const repository = new KyselyAuditLogRepository();
  const users = new KyselyUserRepository();

  beforeAll(() => {
    db = openIntegrationDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('records an entry and lists it back with metadata round-tripped through JSONB', async () => {
    const entityId = uniqueSuffix();
    await repository.record(db, {
      userId: null,
      action: `test.action.${entityId}`,
      entityType: 'test_entity',
      entityId,
      metadata: { foo: 'bar', count: 3 },
    });

    const results = await repository.list(db, { action: `test.action.${entityId}` }, 10, 0);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      userId: null,
      action: `test.action.${entityId}`,
      entityType: 'test_entity',
      entityId,
      metadata: { foo: 'bar', count: 3 },
    });
  });

  it('filters by userId, entityType, and action independently', async () => {
    const marker = uniqueSuffix();
    // audit_logs.user_id has a real FK to users(id) (migration 0013) — a
    // made-up UUID would fail with a foreign-key violation, so this uses
    // a genuinely created user, same as the other repositories' tests.
    const user = await users.create(db, {
      email: `audit-${marker}@example.com`,
      passwordHash: 'irrelevant',
      fullName: 'Audit Log Test User',
      roleId: OWNER_ROLE_ID,
      isActive: true,
    });

    await repository.record(db, { userId: user.id, action: 'filter.a', entityType: `entity.${marker}`, entityId: null });
    await repository.record(db, { userId: user.id, action: 'filter.b', entityType: `entity.${marker}`, entityId: null });
    await repository.record(db, { userId: null, action: 'filter.a', entityType: `entity.${marker}`, entityId: null });

    await expect(repository.list(db, { userId: user.id }, 10, 0)).resolves.toHaveLength(2);
    await expect(repository.list(db, { entityType: `entity.${marker}`, action: 'filter.a' }, 10, 0)).resolves.toHaveLength(2);
    await expect(repository.list(db, { entityType: `entity.${marker}` }, 10, 0)).resolves.toHaveLength(3);
  });

  it('filters by a from/to date range', async () => {
    const marker = uniqueSuffix();
    await repository.record(db, { userId: null, action: `range.${marker}`, entityType: 'range_test', entityId: null });

    const farFuture = new Date(Date.now() + 60 * 60 * 1000);
    const farPast = new Date(Date.now() - 60 * 60 * 1000);

    await expect(
      repository.list(db, { action: `range.${marker}`, from: farPast, to: farFuture }, 10, 0),
    ).resolves.toHaveLength(1);
    await expect(
      repository.list(db, { action: `range.${marker}`, from: farFuture }, 10, 0),
    ).resolves.toHaveLength(0);
  });

  it('orders results newest-first and respects limit/offset', async () => {
    const marker = uniqueSuffix();
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- ordering depends on real, distinct created_at values
      await repository.record(db, { userId: null, action: `order.${marker}.${i}`, entityType: 'order_test', entityId: null });
    }

    const page1 = await repository.list(db, { entityType: 'order_test' }, 2, 0);
    const page2 = await repository.list(db, { entityType: 'order_test' }, 2, 2);

    expect(page1).toHaveLength(2);
    expect(page1[0].createdAt.getTime()).toBeGreaterThanOrEqual(page1[1].createdAt.getTime());
    // No overlap between the two pages.
    const page1Ids = new Set(page1.map((r) => r.id));
    for (const row of page2) expect(page1Ids.has(row.id)).toBe(false);
  });
});
