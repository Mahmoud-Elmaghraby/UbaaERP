import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { BranchRepository } from '../ports/branch.repository';
import type { Branch } from '../../domain/branch.entity';
import { ConflictError, NotFoundError } from '../errors';
import { BranchesService } from './branches.service';

const FAKE_DB = {} as Kysely<TenantDatabase>;

function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: 'branch-1',
    name: 'Main Branch',
    code: 'MAIN',
    address: null,
    isActive: true,
    customFields: {},
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMockRepository(): jest.Mocked<BranchRepository> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    findByCode: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
}

describe('BranchesService', () => {
  let repository: jest.Mocked<BranchRepository>;
  let service: BranchesService;

  beforeEach(() => {
    repository = makeMockRepository();
    service = new BranchesService(repository);
  });

  it('list() delegates straight to the repository', async () => {
    const branches = [makeBranch()];
    repository.list.mockResolvedValue(branches);

    await expect(service.list(FAKE_DB)).resolves.toBe(branches);
    expect(repository.list).toHaveBeenCalledWith(FAKE_DB);
  });

  describe('getById()', () => {
    it('returns the branch when found', async () => {
      const branch = makeBranch();
      repository.findById.mockResolvedValue(branch);

      await expect(service.getById(FAKE_DB, 'branch-1')).resolves.toBe(branch);
    });

    it('throws NotFoundError when the repository returns null', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create()', () => {
    it('returns the created branch on success', async () => {
      const branch = makeBranch();
      repository.create.mockResolvedValue(branch);

      const input = { name: 'Main Branch', code: 'MAIN' };
      await expect(service.create(FAKE_DB, input)).resolves.toBe(branch);
      expect(repository.create).toHaveBeenCalledWith(FAKE_DB, input);
    });

    it('translates a unique-violation into ConflictError mentioning the code', async () => {
      repository.create.mockRejectedValue(uniqueViolation());

      await expect(service.create(FAKE_DB, { name: 'Dup', code: 'DUP' })).rejects.toThrow(
        /A branch with code "DUP" already exists\./,
      );
    });

    it('rethrows any other error unchanged', async () => {
      const unrelated = new Error('connection reset');
      repository.create.mockRejectedValue(unrelated);

      await expect(service.create(FAKE_DB, { name: 'X', code: 'X' })).rejects.toBe(unrelated);
    });
  });

  describe('update()', () => {
    it('returns the updated branch on success', async () => {
      const branch = makeBranch({ name: 'Renamed' });
      repository.update.mockResolvedValue(branch);

      await expect(service.update(FAKE_DB, 'branch-1', { name: 'Renamed' })).resolves.toBe(branch);
    });

    it('throws NotFoundError when the repository returns null', async () => {
      repository.update.mockResolvedValue(null);

      await expect(service.update(FAKE_DB, 'missing', { name: 'X' })).rejects.toThrow(NotFoundError);
    });

    it('translates a unique-violation into ConflictError', async () => {
      repository.update.mockRejectedValue(uniqueViolation());

      await expect(
        service.update(FAKE_DB, 'branch-1', { name: 'X', code: 'DUP' }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('delete()', () => {
    it('resolves when the repository reports a deletion', async () => {
      repository.delete.mockResolvedValue(true);

      await expect(service.delete(FAKE_DB, 'branch-1')).resolves.toBeUndefined();
    });

    it('throws NotFoundError when nothing was deleted', async () => {
      repository.delete.mockResolvedValue(false);

      await expect(service.delete(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });
  });
});
