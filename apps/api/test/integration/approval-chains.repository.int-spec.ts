import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { KyselyApprovalChainRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-approval-chain.repository';
import { KyselyUserRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-user.repository';
import { OWNER_ROLE_ID } from '../../src/database/tenant/well-known-ids';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

describe('KyselyApprovalChainRepository (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const repository = new KyselyApprovalChainRepository();
  const users = new KyselyUserRepository();

  beforeAll(() => {
    db = openIntegrationDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  async function makeUser() {
    return users.create(db, {
      email: `approval-${uniqueSuffix()}@example.com`,
      passwordHash: 'irrelevant',
      fullName: 'Approval Chain Test User',
      roleId: OWNER_ROLE_ID,
      isActive: true,
    });
  }

  it('getManagerId() returns null when no chain row exists yet', async () => {
    const user = await makeUser();
    await expect(repository.getManagerId(db, user.id)).resolves.toBeNull();
  });

  it('setManager() creates the row on first call, and updates it (not a duplicate) on a second call', async () => {
    const employee = await makeUser();
    const managerA = await makeUser();
    const managerB = await makeUser();

    await repository.setManager(db, employee.id, managerA.id);
    await expect(repository.getManagerId(db, employee.id)).resolves.toBe(managerA.id);

    await repository.setManager(db, employee.id, managerB.id);
    await expect(repository.getManagerId(db, employee.id)).resolves.toBe(managerB.id);
  });

  it('setManager() with null clears an existing manager', async () => {
    const employee = await makeUser();
    const manager = await makeUser();
    await repository.setManager(db, employee.id, manager.id);

    await repository.setManager(db, employee.id, null);

    await expect(repository.getManagerId(db, employee.id)).resolves.toBeNull();
  });

  it('rejects a self-manager at the DATABASE level via the CHECK constraint — defense in depth below the service layer', async () => {
    const user = await makeUser();
    // The repository itself has no self-manager guard (only
    // ApprovalChainsService does, see its unit tests) — this proves the
    // database's own CHECK constraint (migration 0012) backs it up
    // independently, so a bug in the service layer alone couldn't corrupt
    // this invariant.
    await expect(repository.setManager(db, user.id, user.id)).rejects.toMatchObject({ code: '23514' });
  });
});
