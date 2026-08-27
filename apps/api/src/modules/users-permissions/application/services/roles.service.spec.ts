import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { RoleRepository } from '../ports/role.repository';
import type { AuditLogRepository } from '../ports/audit-log.repository';
import type { Role } from '../../domain/role.entity';
import { ConflictError, NotFoundError } from '../errors';
import { RolesService } from './roles.service';

const FAKE_DB = {} as Kysely<TenantDatabase>;

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-1',
    name: 'Cashier',
    isSystem: false,
    permissionKeys: ['settings.manage'],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key'), { code: '23505' });
}

function foreignKeyViolation(): Error {
  return Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
}

describe('RolesService', () => {
  let roles: jest.Mocked<RoleRepository>;
  let auditLogs: jest.Mocked<AuditLogRepository>;
  let service: RolesService;

  beforeEach(() => {
    roles = { list: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
    auditLogs = { record: jest.fn(), list: jest.fn() };
    service = new RolesService(roles, auditLogs);
  });

  it('list() delegates to the repository', async () => {
    const all = [makeRole()];
    roles.list.mockResolvedValue(all);
    await expect(service.list(FAKE_DB)).resolves.toBe(all);
  });

  describe('getById()', () => {
    it('returns the role when found', async () => {
      const role = makeRole();
      roles.findById.mockResolvedValue(role);
      await expect(service.getById(FAKE_DB, 'role-1')).resolves.toBe(role);
    });

    it('throws NotFoundError when missing', async () => {
      roles.findById.mockResolvedValue(null);
      await expect(service.getById(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create()', () => {
    it('records an audit log entry and returns the created role', async () => {
      const role = makeRole();
      roles.create.mockResolvedValue(role);

      const result = await service.create(FAKE_DB, { name: 'Cashier', permissionKeys: ['settings.manage'] }, 'actor-1');

      expect(result).toBe(role);
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ userId: 'actor-1', action: 'role.created', entityType: 'role', entityId: 'role-1' }),
      );
    });

    it('translates a unique-violation into ConflictError and records no audit log', async () => {
      roles.create.mockRejectedValue(uniqueViolation());

      await expect(
        service.create(FAKE_DB, { name: 'Cashier', permissionKeys: [] }, 'actor-1'),
      ).rejects.toThrow(/A role named "Cashier" already exists\./);
      expect(auditLogs.record).not.toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('records an audit log entry and returns the updated role', async () => {
      const role = makeRole({ name: 'Senior Cashier' });
      roles.update.mockResolvedValue(role);

      const result = await service.update(FAKE_DB, 'role-1', { name: 'Senior Cashier' }, 'actor-1');

      expect(result).toBe(role);
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ userId: 'actor-1', action: 'role.updated', entityId: 'role-1' }),
      );
    });

    it('throws NotFoundError when the repository returns null, without recording an audit log', async () => {
      roles.update.mockResolvedValue(null);
      await expect(service.update(FAKE_DB, 'missing', { name: 'X' }, 'actor-1')).rejects.toThrow(NotFoundError);
      expect(auditLogs.record).not.toHaveBeenCalled();
    });

    it('translates a unique-violation into ConflictError', async () => {
      roles.update.mockRejectedValue(uniqueViolation());
      await expect(service.update(FAKE_DB, 'role-1', { name: 'Dup' }, 'actor-1')).rejects.toThrow(ConflictError);
    });
  });

  describe('delete()', () => {
    it('throws NotFoundError when the role does not exist, without touching the repository delete', async () => {
      roles.findById.mockResolvedValue(null);
      await expect(service.delete(FAKE_DB, 'missing', 'actor-1')).rejects.toThrow(NotFoundError);
      expect(roles.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a system role without ever calling repository.delete()', async () => {
      roles.findById.mockResolvedValue(makeRole({ isSystem: true, name: 'Owner' }));
      await expect(service.delete(FAKE_DB, 'role-1', 'actor-1')).rejects.toThrow(
        /"Owner" is a system role and cannot be deleted\./,
      );
      expect(roles.delete).not.toHaveBeenCalled();
    });

    it('translates a foreign-key violation into a ConflictError about assigned users', async () => {
      roles.findById.mockResolvedValue(makeRole());
      roles.delete.mockRejectedValue(foreignKeyViolation());
      await expect(service.delete(FAKE_DB, 'role-1', 'actor-1')).rejects.toThrow(
        /still assigned to one or more users/,
      );
    });

    it('throws NotFoundError when the repository reports nothing was deleted', async () => {
      roles.findById.mockResolvedValue(makeRole());
      roles.delete.mockResolvedValue(false);
      await expect(service.delete(FAKE_DB, 'role-1', 'actor-1')).rejects.toThrow(NotFoundError);
    });

    it('records an audit log entry on a successful delete', async () => {
      roles.findById.mockResolvedValue(makeRole());
      roles.delete.mockResolvedValue(true);

      await service.delete(FAKE_DB, 'role-1', 'actor-1');

      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ userId: 'actor-1', action: 'role.deleted', entityId: 'role-1' }),
      );
    });
  });
});
