import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../src/database/tenant/kysely-client';
import { KyselyCustomFieldDefinitionRepository } from '../../src/modules/settings/infrastructure/persistence/kysely-custom-field-definition.repository';
import { openIntegrationDb, uniqueSuffix } from './tenant-db';

describe('KyselyCustomFieldDefinitionRepository (integration, real Postgres)', () => {
  let db: Kysely<TenantDatabase>;
  const repository = new KyselyCustomFieldDefinitionRepository();

  beforeAll(() => {
    db = openIntegrationDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('creates a "list" field definition and round-trips its options array through JSONB', async () => {
    const entityType = `entity_${uniqueSuffix()}`;
    const created = await repository.create(db, {
      entityType,
      fieldKey: 'preferred_color',
      label: 'Preferred Color',
      fieldType: 'list',
      options: ['red', 'green', 'blue'],
    });

    expect(created.options).toEqual(['red', 'green', 'blue']);
    expect(created.isRequired).toBe(false); // default
    expect(created.displayOrder).toBe(0); // default

    const found = await repository.findById(db, created.id);
    expect(found?.options).toEqual(['red', 'green', 'blue']);
  });

  it('stores null options for a non-list field type', async () => {
    const entityType = `entity_${uniqueSuffix()}`;
    const created = await repository.create(db, {
      entityType,
      fieldKey: 'weight_kg',
      label: 'Weight (kg)',
      fieldType: 'number',
    });
    expect(created.options).toBeNull();
  });

  it('enforces uniqueness on (entity_type, field_key)', async () => {
    const entityType = `entity_${uniqueSuffix()}`;
    await repository.create(db, { entityType, fieldKey: 'dup_key', label: 'A', fieldType: 'text' });

    await expect(
      repository.create(db, { entityType, fieldKey: 'dup_key', label: 'B', fieldType: 'text' }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('allows the SAME field_key on a DIFFERENT entity_type', async () => {
    const fieldKey = `shared_key_${uniqueSuffix()}`;
    await repository.create(db, { entityType: 'entity_a', fieldKey, label: 'A', fieldType: 'text' });
    await expect(
      repository.create(db, { entityType: 'entity_b', fieldKey, label: 'B', fieldType: 'text' }),
    ).resolves.toBeDefined();
  });

  it('listByEntityType() returns only that entity type, ordered by display_order', async () => {
    const entityType = `entity_${uniqueSuffix()}`;
    await repository.create(db, { entityType, fieldKey: 'second', label: 'Second', fieldType: 'text', displayOrder: 2 });
    await repository.create(db, { entityType, fieldKey: 'first', label: 'First', fieldType: 'text', displayOrder: 1 });
    await repository.create(db, { entityType: `other_${uniqueSuffix()}`, fieldKey: 'unrelated', label: 'Unrelated', fieldType: 'text' });

    const results = await repository.listByEntityType(db, entityType);
    expect(results.map((d) => d.fieldKey)).toEqual(['first', 'second']);
  });

  it('update() changes label/options and findById()/update()/delete() report absence for a missing id', async () => {
    const entityType = `entity_${uniqueSuffix()}`;
    const created = await repository.create(db, {
      entityType,
      fieldKey: 'to_update',
      label: 'Original',
      fieldType: 'list',
      options: ['a'],
    });

    const updated = await repository.update(db, created.id, { label: 'Renamed', options: ['a', 'b'] });
    expect(updated?.label).toBe('Renamed');
    expect(updated?.options).toEqual(['a', 'b']);

    const missingId = '00000000-0000-0000-0000-000000000000';
    await expect(repository.findById(db, missingId)).resolves.toBeNull();
    await expect(repository.update(db, missingId, { label: 'X' })).resolves.toBeNull();
    await expect(repository.delete(db, missingId)).resolves.toBe(false);
  });

  it('delete() removes the row', async () => {
    const entityType = `entity_${uniqueSuffix()}`;
    const created = await repository.create(db, {
      entityType,
      fieldKey: 'to_delete',
      label: 'Delete Me',
      fieldType: 'text',
    });
    await expect(repository.delete(db, created.id)).resolves.toBe(true);
    await expect(repository.findById(db, created.id)).resolves.toBeNull();
  });
});
