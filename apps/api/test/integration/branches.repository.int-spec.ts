import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { KyselyBranchRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-branch.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

describe('KyselyBranchRepository (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const repository = new KyselyBranchRepository();

  beforeAll(() => {
    db = openIntegrationDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('creates a branch and reads it back with defaults applied', async () => {
    const code = `MAIN-${uniqueSuffix()}`;
    const created = await repository.create(db, { name: 'Main Branch', code });

    expect(created.id).toBeTruthy();
    expect(created.code).toBe(code);
    expect(created.isActive).toBe(true); // default applied by the repository, not passed explicitly
    expect(created.customFields).toEqual({});

    const found = await repository.findById(db, created.id);
    expect(found).toEqual(created);
  });

  it('findByCode() finds a branch by its unique code', async () => {
    const code = `BYCODE-${uniqueSuffix()}`;
    const created = await repository.create(db, { name: 'Findable Branch', code });

    const found = await repository.findByCode(db, code);
    expect(found?.id).toBe(created.id);
  });

  it('returns null from findById()/findByCode() when nothing matches', async () => {
    await expect(repository.findById(db, '00000000-0000-0000-0000-000000000000')).resolves.toBeNull();
    await expect(repository.findByCode(db, `no-such-code-${uniqueSuffix()}`)).resolves.toBeNull();
  });

  it('enforces the unique constraint on code with a real Postgres unique-violation', async () => {
    const code = `DUP-${uniqueSuffix()}`;
    await repository.create(db, { name: 'First', code });

    await expect(repository.create(db, { name: 'Second', code })).rejects.toMatchObject({ code: '23505' });
  });

  it('update() applies a partial patch and bumps updated_at, leaving other fields untouched', async () => {
    const created = await repository.create(db, { name: 'Original Name', code: `UPD-${uniqueSuffix()}` });

    const updated = await repository.update(db, created.id, { name: 'New Name' });

    expect(updated?.name).toBe('New Name');
    expect(updated?.code).toBe(created.code); // untouched
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it('update() persists a JSON custom_fields patch and round-trips it correctly', async () => {
    const created = await repository.create(db, { name: 'CF Branch', code: `CF-${uniqueSuffix()}` });

    const updated = await repository.update(db, created.id, {
      customFields: { floorAreaSqm: 120, hasParking: true },
    });

    expect(updated?.customFields).toEqual({ floorAreaSqm: 120, hasParking: true });
  });

  it('update() returns null for a nonexistent id instead of throwing', async () => {
    await expect(
      repository.update(db, '00000000-0000-0000-0000-000000000000', { name: 'X' }),
    ).resolves.toBeNull();
  });

  it('delete() removes the row and reports success, and is idempotent-safe (false the second time)', async () => {
    const created = await repository.create(db, { name: 'To Delete', code: `DEL-${uniqueSuffix()}` });

    await expect(repository.delete(db, created.id)).resolves.toBe(true);
    await expect(repository.findById(db, created.id)).resolves.toBeNull();
    await expect(repository.delete(db, created.id)).resolves.toBe(false);
  });

  it('list() includes a newly created branch, ordered by name', async () => {
    const codeA = `LIST-A-${uniqueSuffix()}`;
    const codeB = `LIST-B-${uniqueSuffix()}`;
    await repository.create(db, { name: `AAA-${codeA}`, code: codeA });
    await repository.create(db, { name: `ZZZ-${codeB}`, code: codeB });

    const all = await repository.list(db);
    const names = all.map((b) => b.name);
    expect(names).toContain(`AAA-${codeA}`);
    expect(names).toContain(`ZZZ-${codeB}`);
    expect(names.indexOf(`AAA-${codeA}`)).toBeLessThan(names.indexOf(`ZZZ-${codeB}`));
  });
});
