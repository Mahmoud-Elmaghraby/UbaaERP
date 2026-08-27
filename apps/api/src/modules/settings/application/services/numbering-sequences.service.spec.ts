import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { NumberingSequenceRepository } from '../ports/numbering-sequence.repository';
import type { NumberingSequence } from '../../domain/numbering-sequence.entity';
import { ConflictError, NotFoundError } from '../errors';
import { NumberingSequencesService } from './numbering-sequences.service';

const FAKE_DB = {} as Kysely<TenantDatabase>;

function makeSequence(overrides: Partial<NumberingSequence> = {}): NumberingSequence {
  return {
    id: 'seq-1',
    documentType: 'sales_invoice',
    branchId: null,
    prefix: 'INV-',
    nextNumber: 1,
    paddingLength: 5,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMockRepository(): jest.Mocked<NumberingSequenceRepository> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    allocateNext: jest.fn(),
  };
}

function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key'), { code: '23505' });
}

describe('NumberingSequencesService', () => {
  let repository: jest.Mocked<NumberingSequenceRepository>;
  let service: NumberingSequencesService;

  beforeEach(() => {
    repository = makeMockRepository();
    service = new NumberingSequencesService(repository);
  });

  it('list() delegates to the repository', async () => {
    const sequences = [makeSequence()];
    repository.list.mockResolvedValue(sequences);
    await expect(service.list(FAKE_DB)).resolves.toBe(sequences);
  });

  describe('getById()', () => {
    it('returns the sequence when found', async () => {
      const sequence = makeSequence();
      repository.findById.mockResolvedValue(sequence);
      await expect(service.getById(FAKE_DB, 'seq-1')).resolves.toBe(sequence);
    });

    it('throws NotFoundError when missing', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getById(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create()', () => {
    it('mentions "tenant-wide" in the conflict message when no branchId was given', async () => {
      repository.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(FAKE_DB, { documentType: 'sales_invoice' }),
      ).rejects.toThrow(ConflictError);
      await expect(
        service.create(FAKE_DB, { documentType: 'sales_invoice' }),
      ).rejects.toThrow(/tenant-wide/);
    });

    it('mentions the branch instead when branchId was given', async () => {
      repository.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(FAKE_DB, { documentType: 'sales_invoice', branchId: 'branch-1' }),
      ).rejects.toThrow(ConflictError);
      await expect(
        service.create(FAKE_DB, { documentType: 'sales_invoice', branchId: 'branch-1' }),
      ).rejects.toThrow(/and this branch/);
    });

    it('returns the created sequence on success', async () => {
      const sequence = makeSequence();
      repository.create.mockResolvedValue(sequence);
      await expect(service.create(FAKE_DB, { documentType: 'sales_invoice' })).resolves.toBe(sequence);
    });
  });

  describe('update()', () => {
    it('throws NotFoundError when the repository returns null', async () => {
      repository.update.mockResolvedValue(null);
      await expect(service.update(FAKE_DB, 'missing', { nextNumber: 5 })).rejects.toThrow(NotFoundError);
    });

    it('does NOT wrap a unique-violation from update() — only create() does', async () => {
      // Documents the service's actual (asymmetric) error-handling: unlike
      // create(), update() has no try/catch around the repository call.
      const violation = uniqueViolation();
      repository.update.mockRejectedValue(violation);
      await expect(service.update(FAKE_DB, 'seq-1', { nextNumber: 5 })).rejects.toBe(violation);
    });

    it('returns the updated sequence on success', async () => {
      const sequence = makeSequence({ nextNumber: 5 });
      repository.update.mockResolvedValue(sequence);
      await expect(service.update(FAKE_DB, 'seq-1', { nextNumber: 5 })).resolves.toBe(sequence);
    });
  });

  describe('delete()', () => {
    it('throws NotFoundError when nothing was deleted', async () => {
      repository.delete.mockResolvedValue(false);
      await expect(service.delete(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });

    it('resolves when a row was deleted', async () => {
      repository.delete.mockResolvedValue(true);
      await expect(service.delete(FAKE_DB, 'seq-1')).resolves.toBeUndefined();
    });
  });

  it('allocateNext() delegates to the repository with a defaulted null branchId', async () => {
    const allocated = { sequenceId: 'seq-1', number: 1, formatted: 'INV-00001' };
    repository.allocateNext.mockResolvedValue(allocated);

    await expect(service.allocateNext(FAKE_DB, 'sales_invoice')).resolves.toBe(allocated);
    expect(repository.allocateNext).toHaveBeenCalledWith(FAKE_DB, 'sales_invoice', null);
  });
});
