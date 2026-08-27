import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { DocumentTemplateRepository } from '../ports/document-template.repository';
import type { DocumentTemplate } from '../../domain/document-template.entity';
import { ConflictError, NotFoundError } from '../errors';
import { DocumentTemplatesService } from './document-templates.service';

const FAKE_DB = {} as Kysely<TenantDatabase>;

function makeTemplate(overrides: Partial<DocumentTemplate> = {}): DocumentTemplate {
  return {
    id: 'tpl-1',
    documentType: 'sales_invoice',
    name: 'Default Invoice',
    content: '<html></html>',
    isDefault: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMockRepository(): jest.Mocked<DocumentTemplateRepository> {
  return { list: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
}

function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key'), { code: '23505' });
}

describe('DocumentTemplatesService', () => {
  let repository: jest.Mocked<DocumentTemplateRepository>;
  let service: DocumentTemplatesService;

  beforeEach(() => {
    repository = makeMockRepository();
    service = new DocumentTemplatesService(repository);
  });

  it('list() delegates to the repository', async () => {
    const templates = [makeTemplate()];
    repository.list.mockResolvedValue(templates);
    await expect(service.list(FAKE_DB)).resolves.toBe(templates);
  });

  describe('getById()', () => {
    it('returns the template when found', async () => {
      const template = makeTemplate();
      repository.findById.mockResolvedValue(template);
      await expect(service.getById(FAKE_DB, 'tpl-1')).resolves.toBe(template);
    });

    it('throws NotFoundError when missing', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getById(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create()', () => {
    it('translates a unique-violation into a "default template" ConflictError', async () => {
      repository.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(FAKE_DB, { documentType: 'sales_invoice', name: 'X', isDefault: true }),
      ).rejects.toThrow(/A default template already exists for document type "sales_invoice"/);
    });

    it('returns the created template on success', async () => {
      const template = makeTemplate();
      repository.create.mockResolvedValue(template);
      await expect(
        service.create(FAKE_DB, { documentType: 'sales_invoice', name: 'Default Invoice' }),
      ).resolves.toBe(template);
    });
  });

  describe('update()', () => {
    it('throws NotFoundError when the repository returns null', async () => {
      repository.update.mockResolvedValue(null);
      await expect(service.update(FAKE_DB, 'missing', { name: 'X' })).rejects.toThrow(NotFoundError);
    });

    it('translates a unique-violation into ConflictError', async () => {
      repository.update.mockRejectedValue(uniqueViolation());
      await expect(service.update(FAKE_DB, 'tpl-1', { isDefault: true })).rejects.toThrow(ConflictError);
    });

    it('returns the updated template on success', async () => {
      const template = makeTemplate({ name: 'Renamed' });
      repository.update.mockResolvedValue(template);
      await expect(service.update(FAKE_DB, 'tpl-1', { name: 'Renamed' })).resolves.toBe(template);
    });
  });

  describe('delete()', () => {
    it('throws NotFoundError when nothing was deleted', async () => {
      repository.delete.mockResolvedValue(false);
      await expect(service.delete(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });

    it('resolves when a row was deleted', async () => {
      repository.delete.mockResolvedValue(true);
      await expect(service.delete(FAKE_DB, 'tpl-1')).resolves.toBeUndefined();
    });
  });
});
