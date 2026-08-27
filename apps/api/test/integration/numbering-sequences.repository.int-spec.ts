import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { KyselyNumberingSequenceRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-numbering-sequence.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

describe('KyselyNumberingSequenceRepository (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const repository = new KyselyNumberingSequenceRepository();

  beforeAll(() => {
    db = openIntegrationDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('creates a tenant-wide (branch_id null) sequence with documented defaults', async () => {
    const documentType = `doctype_${uniqueSuffix()}`;
    const created = await repository.create(db, { documentType });

    expect(created.branchId).toBeNull();
    expect(created.nextNumber).toBe(1);
    expect(created.paddingLength).toBe(5);
  });

  it('enforces one tenant-wide sequence per document_type via the COALESCE unique index', async () => {
    const documentType = `doctype_${uniqueSuffix()}`;
    await repository.create(db, { documentType });

    await expect(repository.create(db, { documentType })).rejects.toMatchObject({ code: '23505' });
  });

  it('allocateNext() returns a correctly zero-padded, prefixed formatted number and increments next_number', async () => {
    const documentType = `doctype_${uniqueSuffix()}`;
    await repository.create(db, { documentType, prefix: 'INV-', nextNumber: 1, paddingLength: 4 });

    const first = await repository.allocateNext(db, documentType, null);
    expect(first.number).toBe(1);
    expect(first.formatted).toBe('INV-0001');

    const second = await repository.allocateNext(db, documentType, null);
    expect(second.number).toBe(2);
    expect(second.formatted).toBe('INV-0002');
  });

  it('allocateNext() throws a clear error when no sequence is configured for that document_type', async () => {
    await expect(repository.allocateNext(db, `no-such-doctype-${uniqueSuffix()}`, null)).rejects.toThrow(
      /No numbering sequence configured/,
    );
  });

  it('allocateNext() never hands out the same number twice under concurrent callers', async () => {
    const documentType = `doctype_${uniqueSuffix()}`;
    await repository.create(db, { documentType, nextNumber: 1 });

    const CONCURRENT_CALLS = 15;
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_CALLS }, () => repository.allocateNext(db, documentType, null)),
    );

    const numbers = results.map((r) => r.number).sort((a, b) => a - b);
    const uniqueNumbers = new Set(numbers);
    expect(uniqueNumbers.size).toBe(CONCURRENT_CALLS); // no duplicates handed out
    expect(numbers).toEqual(Array.from({ length: CONCURRENT_CALLS }, (_, i) => i + 1)); // exactly 1..N, no gaps
  });

  it('update()/findById()/delete() report absence for a nonexistent id without throwing', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';
    await expect(repository.findById(db, missingId)).resolves.toBeNull();
    await expect(repository.update(db, missingId, { nextNumber: 2 })).resolves.toBeNull();
    await expect(repository.delete(db, missingId)).resolves.toBe(false);
  });

  it('delete() removes the row', async () => {
    const created = await repository.create(db, { documentType: `doctype_${uniqueSuffix()}` });
    await expect(repository.delete(db, created.id)).resolves.toBe(true);
    await expect(repository.findById(db, created.id)).resolves.toBeNull();
  });
});
