import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { KyselyDocumentTemplateRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-document-template.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

describe('KyselyDocumentTemplateRepository (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const repository = new KyselyDocumentTemplateRepository();

  beforeAll(() => {
    db = openIntegrationDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('creates a template with content/is_default defaults applied', async () => {
    const documentType = `doc_type_${uniqueSuffix()}`;
    const created = await repository.create(db, { documentType, name: 'Plain Template' });

    expect(created.content).toBe('');
    expect(created.isDefault).toBe(false);

    const found = await repository.findById(db, created.id);
    expect(found).toEqual(created);
  });

  it('allows two non-default templates for the same document_type', async () => {
    const documentType = `doc_type_${uniqueSuffix()}`;
    await repository.create(db, { documentType, name: 'A' });
    await expect(repository.create(db, { documentType, name: 'B' })).resolves.toBeDefined();
  });

  it('allows one default template per document_type, but a second one violates the partial unique index', async () => {
    const documentType = `doc_type_${uniqueSuffix()}`;
    await repository.create(db, { documentType, name: 'Default One', isDefault: true });

    await expect(
      repository.create(db, { documentType, name: 'Default Two', isDefault: true }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('allows a default template per DIFFERENT document_type without conflict', async () => {
    const typeA = `doc_type_${uniqueSuffix()}`;
    const typeB = `doc_type_${uniqueSuffix()}`;
    await repository.create(db, { documentType: typeA, name: 'A Default', isDefault: true });
    await expect(
      repository.create(db, { documentType: typeB, name: 'B Default', isDefault: true }),
    ).resolves.toBeDefined();
  });

  it('update() promoting a second template to default hits the same partial unique index', async () => {
    const documentType = `doc_type_${uniqueSuffix()}`;
    await repository.create(db, { documentType, name: 'Default', isDefault: true });
    const other = await repository.create(db, { documentType, name: 'Not Default' });

    await expect(repository.update(db, other.id, { isDefault: true })).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('update()/findById()/delete() report absence for a nonexistent id without throwing', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';
    await expect(repository.findById(db, missingId)).resolves.toBeNull();
    await expect(repository.update(db, missingId, { name: 'X' })).resolves.toBeNull();
    await expect(repository.delete(db, missingId)).resolves.toBe(false);
  });

  it('delete() removes the row, freeing up the default slot for that document_type', async () => {
    const documentType = `doc_type_${uniqueSuffix()}`;
    const created = await repository.create(db, { documentType, name: 'Only Default', isDefault: true });

    await expect(repository.delete(db, created.id)).resolves.toBe(true);
    // With the default gone, a new default for the same type should succeed.
    await expect(
      repository.create(db, { documentType, name: 'New Default', isDefault: true }),
    ).resolves.toBeDefined();
  });
});
