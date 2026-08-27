import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { KyselyPermissionRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-permission.repository';
import { openIntegrationDb } from './tenant-db';

describe('KyselyPermissionRepository (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const repository = new KyselyPermissionRepository();

  beforeAll(() => {
    db = openIntegrationDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('lists the fixed seeded catalog (migration 0007), ordered by key', async () => {
    const permissions = await repository.list(db);
    const keys = permissions.map((p) => p.key);

    expect(keys).toEqual([...keys].sort());
    expect(keys).toEqual(
      expect.arrayContaining(['audit_logs.view', 'roles.manage', 'settings.manage', 'users.manage']),
    );
  });
});
