import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { WarehouseRepository } from '../ports/warehouse.repository';
import type { WarehouseLocationRepository } from '../ports/warehouse-location.repository';
import type { Warehouse } from '../../domain/warehouse.entity';
import type { WarehouseLocation } from '../../domain/warehouse-location.entity';
import { ConflictError, NotFoundError } from '../errors';
import { WarehousesService } from './warehouses.service';

const FAKE_TRX = { __trx: true } as unknown as Kysely<TenantDatabase>;
const FAKE_DB = {
  transaction: () => ({
    execute: (cb: (trx: Kysely<TenantDatabase>) => unknown) => cb(FAKE_TRX),
  }),
} as unknown as Kysely<TenantDatabase>;

function makeWarehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return {
    id: 'wh-1',
    name: 'Main Warehouse',
    code: 'MAIN',
    address: null,
    branchId: null,
    isActive: true,
    customFields: {},
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeLocation(overrides: Partial<WarehouseLocation> = {}): WarehouseLocation {
  return {
    id: 'loc-1',
    warehouseId: 'wh-1',
    code: 'DEFAULT',
    name: 'الموقع الرئيسي',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMockRepository(): jest.Mocked<WarehouseRepository> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function makeMockLocationRepository(): jest.Mocked<WarehouseLocationRepository> {
  return {
    listByWarehouseId: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
}

function foreignKeyViolation(): Error {
  return Object.assign(new Error('insert or update on table violates foreign key constraint'), { code: '23503' });
}

describe('WarehousesService', () => {
  let repository: jest.Mocked<WarehouseRepository>;
  let locations: jest.Mocked<WarehouseLocationRepository>;
  let service: WarehousesService;

  beforeEach(() => {
    repository = makeMockRepository();
    locations = makeMockLocationRepository();
    service = new WarehousesService(repository, locations);
  });

  it('list() delegates straight to the repository', async () => {
    const warehouses = [makeWarehouse()];
    repository.list.mockResolvedValue(warehouses);

    await expect(service.list(FAKE_DB)).resolves.toBe(warehouses);
  });

  describe('getById()', () => {
    it('returns the warehouse when found', async () => {
      const warehouse = makeWarehouse();
      repository.findById.mockResolvedValue(warehouse);

      await expect(service.getById(FAKE_DB, 'wh-1')).resolves.toBe(warehouse);
    });

    it('throws NotFoundError when the repository returns null', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create()', () => {
    it('creates the warehouse and its default location in the same transaction', async () => {
      const warehouse = makeWarehouse();
      const location = makeLocation();
      repository.create.mockResolvedValue(warehouse);
      locations.create.mockResolvedValue(location);

      const result = await service.create(FAKE_DB, { name: 'Main Warehouse', code: 'MAIN' });

      expect(repository.create).toHaveBeenCalledWith(FAKE_TRX, { name: 'Main Warehouse', code: 'MAIN' });
      expect(locations.create).toHaveBeenCalledWith(FAKE_TRX, {
        warehouseId: warehouse.id,
        code: 'DEFAULT',
        name: 'الموقع الرئيسي',
      });
      expect(result.defaultLocation).toBe(location);
    });

    it('translates a unique-violation into ConflictError', async () => {
      repository.create.mockRejectedValue(uniqueViolation());

      await expect(service.create(FAKE_DB, { name: 'Dup', code: 'DUP' })).rejects.toThrow(ConflictError);
    });

    it('translates a foreign-key-violation on branchId into NotFoundError', async () => {
      repository.create.mockRejectedValue(foreignKeyViolation());

      await expect(
        service.create(FAKE_DB, { name: 'X', code: 'X', branchId: 'missing-branch' }),
      ).rejects.toThrow(/Branch "missing-branch" not found\./);
    });
  });

  describe('update()', () => {
    it('returns the updated warehouse on success', async () => {
      const warehouse = makeWarehouse({ name: 'Renamed' });
      repository.update.mockResolvedValue(warehouse);

      await expect(service.update(FAKE_DB, 'wh-1', { name: 'Renamed' })).resolves.toBe(warehouse);
    });

    it('throws NotFoundError when the repository returns null', async () => {
      repository.update.mockResolvedValue(null);

      await expect(service.update(FAKE_DB, 'missing', { name: 'X' })).rejects.toThrow(NotFoundError);
    });

    it('translates a unique-violation into ConflictError', async () => {
      repository.update.mockRejectedValue(uniqueViolation());

      await expect(service.update(FAKE_DB, 'wh-1', { name: 'X', code: 'DUP' })).rejects.toThrow(ConflictError);
    });
  });

  describe('delete()', () => {
    it('resolves when the repository reports a deletion', async () => {
      repository.delete.mockResolvedValue(true);

      await expect(service.delete(FAKE_DB, 'wh-1')).resolves.toBeUndefined();
    });

    it('throws NotFoundError when nothing was deleted', async () => {
      repository.delete.mockResolvedValue(false);

      await expect(service.delete(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('addLocation()', () => {
    it('adds a location to an existing warehouse', async () => {
      const warehouse = makeWarehouse();
      const location = makeLocation({ code: 'A1', name: 'Aisle 1' });
      repository.findById.mockResolvedValue(warehouse);
      locations.create.mockResolvedValue(location);

      await expect(service.addLocation(FAKE_DB, warehouse.id, { code: 'A1', name: 'Aisle 1' })).resolves.toBe(
        location,
      );
    });

    it('throws NotFoundError when the warehouse does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.addLocation(FAKE_DB, 'missing', { code: 'A1', name: 'Aisle 1' })).rejects.toThrow(
        NotFoundError,
      );
    });

    it('translates a unique-violation on code into ConflictError', async () => {
      const warehouse = makeWarehouse();
      repository.findById.mockResolvedValue(warehouse);
      locations.create.mockRejectedValue(uniqueViolation());

      await expect(service.addLocation(FAKE_DB, warehouse.id, { code: 'DUP', name: 'X' })).rejects.toThrow(
        ConflictError,
      );
    });
  });

  describe('deleteLocation()', () => {
    it('resolves when the repository reports a deletion', async () => {
      locations.delete.mockResolvedValue(true);

      await expect(service.deleteLocation(FAKE_DB, 'loc-1')).resolves.toBeUndefined();
    });

    it('throws NotFoundError when nothing was deleted', async () => {
      locations.delete.mockResolvedValue(false);

      await expect(service.deleteLocation(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });

    it('translates a foreign-key-violation into ConflictError (location still has stock)', async () => {
      locations.delete.mockRejectedValue(foreignKeyViolation());

      await expect(service.deleteLocation(FAKE_DB, 'loc-1')).rejects.toThrow(
        /Cannot delete a location that still has stock recorded/,
      );
    });
  });
});
