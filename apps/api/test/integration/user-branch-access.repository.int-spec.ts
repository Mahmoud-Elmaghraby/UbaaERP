import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { KyselyUserBranchAccessRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-user-branch-access.repository';
import { KyselyUserRepository } from '../../src/modules/users-permissions/infrastructure/persistence/kysely-user.repository';
import { KyselyBranchRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-branch.repository';
import { OWNER_ROLE_ID } from '../../src/database/tenant/well-known-ids';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

// This repository's FK genuinely crosses into Settings' `branches` table
// (same schema, see migration 0011's comment) — using the real
// KyselyBranchRepository/KyselyUserRepository here to set up valid
// fixture rows is the correct way to integration-test that FK, not a
// violation of CLAUDE.md §2.6 (that rule governs business-logic calls
// between modules, not shared test fixtures within one schema).
describe('KyselyUserBranchAccessRepository (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const repository = new KyselyUserBranchAccessRepository();
  const users = new KyselyUserRepository();
  const branches = new KyselyBranchRepository();

  beforeAll(() => {
    db = openIntegrationDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  async function makeUser() {
    return users.create(db, {
      email: `uba-${uniqueSuffix()}@example.com`,
      passwordHash: 'irrelevant',
      fullName: 'Branch Access Test User',
      roleId: OWNER_ROLE_ID,
      isActive: true,
    });
  }

  async function makeBranch() {
    return branches.create(db, { name: `Branch ${uniqueSuffix()}`, code: `BR-${uniqueSuffix()}` });
  }

  it('returns an empty list for a user with no branch access set', async () => {
    const user = await makeUser();
    await expect(repository.listBranchIdsForUser(db, user.id)).resolves.toEqual([]);
  });

  it('setForUser() grants access to exactly the given branches', async () => {
    const user = await makeUser();
    const branchA = await makeBranch();
    const branchB = await makeBranch();

    await repository.setForUser(db, user.id, [branchA.id, branchB.id]);

    const ids = await repository.listBranchIdsForUser(db, user.id);
    expect(ids.sort()).toEqual([branchA.id, branchB.id].sort());
  });

  it('setForUser() is a full replace, not a merge — calling it again drops branches not in the new list', async () => {
    const user = await makeUser();
    const branchA = await makeBranch();
    const branchB = await makeBranch();

    await repository.setForUser(db, user.id, [branchA.id, branchB.id]);
    await repository.setForUser(db, user.id, [branchB.id]);

    await expect(repository.listBranchIdsForUser(db, user.id)).resolves.toEqual([branchB.id]);
  });

  it('setForUser() with an empty array clears all access', async () => {
    const user = await makeUser();
    const branchA = await makeBranch();
    await repository.setForUser(db, user.id, [branchA.id]);

    await repository.setForUser(db, user.id, []);

    await expect(repository.listBranchIdsForUser(db, user.id)).resolves.toEqual([]);
  });

  it('raises a real foreign-key violation for a branch id that does not exist', async () => {
    const user = await makeUser();
    await expect(
      repository.setForUser(db, user.id, ['00000000-0000-0000-0000-000000000000']),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
