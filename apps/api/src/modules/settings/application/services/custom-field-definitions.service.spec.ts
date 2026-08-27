import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { CustomFieldDefinitionRepository } from '../ports/custom-field-definition.repository';
import type { CustomFieldDefinition } from '../../domain/custom-field-definition.entity';
import { ConflictError, NotFoundError } from '../errors';
import { CustomFieldDefinitionsService } from './custom-field-definitions.service';

const FAKE_DB = {} as Kysely<TenantDatabase>;

function makeDefinition(overrides: Partial<CustomFieldDefinition> = {}): CustomFieldDefinition {
  return {
    id: 'cfd-1',
    entityType: 'branch',
    fieldKey: 'floor_area_sqm',
    label: 'Floor area (sqm)',
    fieldType: 'number',
    options: null,
    isRequired: false,
    displayOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMockRepository(): jest.Mocked<CustomFieldDefinitionRepository> {
  return {
    listByEntityType: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key'), { code: '23505' });
}

describe('CustomFieldDefinitionsService', () => {
  let repository: jest.Mocked<CustomFieldDefinitionRepository>;
  let service: CustomFieldDefinitionsService;

  beforeEach(() => {
    repository = makeMockRepository();
    service = new CustomFieldDefinitionsService(repository);
  });

  it('listByEntityType() delegates to the repository', async () => {
    const definitions = [makeDefinition()];
    repository.listByEntityType.mockResolvedValue(definitions);
    await expect(service.listByEntityType(FAKE_DB, 'branch')).resolves.toBe(definitions);
    expect(repository.listByEntityType).toHaveBeenCalledWith(FAKE_DB, 'branch');
  });

  describe('getById()', () => {
    it('returns the definition when found', async () => {
      const definition = makeDefinition();
      repository.findById.mockResolvedValue(definition);
      await expect(service.getById(FAKE_DB, 'cfd-1')).resolves.toBe(definition);
    });

    it('throws NotFoundError when missing', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getById(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create()', () => {
    it('translates a unique-violation into ConflictError naming the field and entity type', async () => {
      repository.create.mockRejectedValue(uniqueViolation());
      const createInput = {
        entityType: 'branch',
        fieldKey: 'floor_area_sqm',
        label: 'Floor area',
        fieldType: 'number',
      } as const;
      await expect(service.create(FAKE_DB, createInput)).rejects.toThrow(ConflictError);
      await expect(service.create(FAKE_DB, createInput)).rejects.toThrow(/floor_area_sqm.*branch/);
    });

    it('returns the created definition on success', async () => {
      const definition = makeDefinition();
      repository.create.mockResolvedValue(definition);
      await expect(
        service.create(FAKE_DB, {
          entityType: 'branch',
          fieldKey: 'floor_area_sqm',
          label: 'Floor area',
          fieldType: 'number',
        }),
      ).resolves.toBe(definition);
    });
  });

  describe('update()', () => {
    it('throws NotFoundError when the repository returns null', async () => {
      repository.update.mockResolvedValue(null);
      await expect(service.update(FAKE_DB, 'missing', { label: 'X' })).rejects.toThrow(NotFoundError);
    });

    it('returns the updated definition on success', async () => {
      const definition = makeDefinition({ label: 'Renamed' });
      repository.update.mockResolvedValue(definition);
      await expect(service.update(FAKE_DB, 'cfd-1', { label: 'Renamed' })).resolves.toBe(definition);
    });
  });

  describe('delete()', () => {
    it('throws NotFoundError when nothing was deleted', async () => {
      repository.delete.mockResolvedValue(false);
      await expect(service.delete(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });

    it('resolves when a row was deleted', async () => {
      repository.delete.mockResolvedValue(true);
      await expect(service.delete(FAKE_DB, 'cfd-1')).resolves.toBeUndefined();
    });
  });
});
