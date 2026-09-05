import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { UnitOfMeasureRepository } from '../ports/unit-of-measure.repository';
import type { UnitOfMeasure } from '../../domain/unit-of-measure.entity';
import { BusinessRuleError, ConflictError, NotFoundError } from '../errors';
import { UnitsOfMeasureService } from './units-of-measure.service';

const FAKE_DB = {} as Kysely<TenantDatabase>;

function makeUnit(overrides: Partial<UnitOfMeasure> = {}): UnitOfMeasure {
  return {
    id: 'uom-1',
    name: 'Piece',
    symbol: 'pc',
    baseUnitId: null,
    conversionFactor: 1,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMockRepository(): jest.Mocked<UnitOfMeasureRepository> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
}

describe('UnitsOfMeasureService', () => {
  let repository: jest.Mocked<UnitOfMeasureRepository>;
  let service: UnitsOfMeasureService;

  beforeEach(() => {
    repository = makeMockRepository();
    service = new UnitsOfMeasureService(repository);
  });

  it('list() delegates straight to the repository', async () => {
    const units = [makeUnit()];
    repository.list.mockResolvedValue(units);

    await expect(service.list(FAKE_DB)).resolves.toBe(units);
  });

  describe('getById()', () => {
    it('returns the unit when found', async () => {
      const unit = makeUnit();
      repository.findById.mockResolvedValue(unit);

      await expect(service.getById(FAKE_DB, 'uom-1')).resolves.toBe(unit);
    });

    it('throws NotFoundError when the repository returns null', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create()', () => {
    it('returns the created unit on success', async () => {
      const unit = makeUnit();
      repository.create.mockResolvedValue(unit);

      const input = { name: 'Piece', symbol: 'pc' };
      await expect(service.create(FAKE_DB, input)).resolves.toBe(unit);
      expect(repository.create).toHaveBeenCalledWith(FAKE_DB, input);
    });

    it('translates a unique-violation into ConflictError mentioning the name', async () => {
      repository.create.mockRejectedValue(uniqueViolation());

      await expect(service.create(FAKE_DB, { name: 'Piece', symbol: 'pc' })).rejects.toThrow(
        /A unit of measure named "Piece" already exists\./,
      );
    });

    it('rethrows any other error unchanged', async () => {
      const unrelated = new Error('connection reset');
      repository.create.mockRejectedValue(unrelated);

      await expect(service.create(FAKE_DB, { name: 'X', symbol: 'x' })).rejects.toBe(unrelated);
    });

    it('accepts a baseUnitId that points at a genuine base unit', async () => {
      const baseUnit = makeUnit({ id: 'uom-base', name: 'Kilogram', symbol: 'kg' });
      const derived = makeUnit({ id: 'uom-2', name: 'Gram', symbol: 'g', baseUnitId: 'uom-base', conversionFactor: 0.001 });
      repository.findById.mockResolvedValue(baseUnit);
      repository.create.mockResolvedValue(derived);

      const input = { name: 'Gram', symbol: 'g', baseUnitId: 'uom-base', conversionFactor: 0.001 };
      await expect(service.create(FAKE_DB, input)).resolves.toBe(derived);
      expect(repository.findById).toHaveBeenCalledWith(FAKE_DB, 'uom-base');
    });

    it('throws NotFoundError when baseUnitId does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.create(FAKE_DB, { name: 'Gram', symbol: 'g', baseUnitId: 'missing-base' }),
      ).rejects.toThrow(NotFoundError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('throws BusinessRuleError when baseUnitId points at a unit that is itself derived (no chains)', async () => {
      const derivedBaseCandidate = makeUnit({ id: 'uom-mid', name: 'Gram', symbol: 'g', baseUnitId: 'uom-base' });
      repository.findById.mockResolvedValue(derivedBaseCandidate);

      await expect(
        service.create(FAKE_DB, { name: 'Milligram', symbol: 'mg', baseUnitId: 'uom-mid' }),
      ).rejects.toThrow(BusinessRuleError);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('returns the updated unit on success', async () => {
      const unit = makeUnit({ name: 'Kilogram' });
      repository.update.mockResolvedValue(unit);

      await expect(service.update(FAKE_DB, 'uom-1', { name: 'Kilogram' })).resolves.toBe(unit);
    });

    it('throws NotFoundError when the repository returns null', async () => {
      repository.update.mockResolvedValue(null);

      await expect(service.update(FAKE_DB, 'missing', { name: 'X' })).rejects.toThrow(NotFoundError);
    });

    it('translates a unique-violation into ConflictError', async () => {
      repository.update.mockRejectedValue(uniqueViolation());

      await expect(service.update(FAKE_DB, 'uom-1', { name: 'Dup' })).rejects.toThrow(ConflictError);
    });

    it('rejects setting a unit as its own base unit', async () => {
      await expect(service.update(FAKE_DB, 'uom-1', { baseUnitId: 'uom-1' })).rejects.toThrow(BusinessRuleError);
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('delete()', () => {
    it('resolves when the repository reports a deletion', async () => {
      repository.delete.mockResolvedValue(true);

      await expect(service.delete(FAKE_DB, 'uom-1')).resolves.toBeUndefined();
    });

    it('throws NotFoundError when nothing was deleted', async () => {
      repository.delete.mockResolvedValue(false);

      await expect(service.delete(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('convert()', () => {
    it('converts a quantity from a derived unit to its base unit', async () => {
      const kg = makeUnit({ id: 'uom-kg', name: 'Kilogram', symbol: 'kg' });
      const g = makeUnit({ id: 'uom-g', name: 'Gram', symbol: 'g', baseUnitId: 'uom-kg', conversionFactor: 0.001 });
      repository.findById.mockImplementation(async (_db, id) => (id === 'uom-kg' ? kg : id === 'uom-g' ? g : null));

      await expect(service.convert(FAKE_DB, 'uom-g', 'uom-kg', 500)).resolves.toBeCloseTo(0.5);
    });

    it('wraps an incompatible-units error from the domain function as BusinessRuleError', async () => {
      const kg = makeUnit({ id: 'uom-kg', name: 'Kilogram', symbol: 'kg' });
      const l = makeUnit({ id: 'uom-l', name: 'Liter', symbol: 'l' });
      repository.findById.mockImplementation(async (_db, id) => (id === 'uom-kg' ? kg : id === 'uom-l' ? l : null));

      await expect(service.convert(FAKE_DB, 'uom-kg', 'uom-l', 1)).rejects.toThrow(BusinessRuleError);
    });
  });
});
