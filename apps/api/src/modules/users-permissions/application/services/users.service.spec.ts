import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { UserRepository } from '../ports/user.repository';
import type { RoleRepository } from '../ports/role.repository';
import type { AuditLogRepository } from '../ports/audit-log.repository';
import type { Role } from '../../domain/role.entity';
import type { User } from '../../domain/user.entity';
import { ConflictError, NotFoundError } from '../errors';
import { UsersService } from './users.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(async (plain: string) => `hashed:${plain}`),
  compare: jest.fn(async (plain: string, hash: string) => hash === `hashed:${plain}`),
}));
import * as bcrypt from 'bcryptjs';

const FAKE_DB = {} as Kysely<TenantDatabase>;

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    fullName: 'A User',
    roleId: 'role-1',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-1',
    name: 'Cashier',
    isSystem: false,
    permissionKeys: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key'), { code: '23505' });
}

describe('UsersService', () => {
  let repository: jest.Mocked<UserRepository>;
  let roles: jest.Mocked<RoleRepository>;
  let auditLogs: jest.Mocked<AuditLogRepository>;
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = {
      list: jest.fn(),
      findById: jest.fn(),
      findByEmailForAuth: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updatePasswordHash: jest.fn(),
    };
    roles = { list: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
    auditLogs = { record: jest.fn(), list: jest.fn() };
    service = new UsersService(repository, roles, auditLogs);
  });

  it('list() delegates to the repository', async () => {
    const all = [makeUser()];
    repository.list.mockResolvedValue(all);
    await expect(service.list(FAKE_DB)).resolves.toBe(all);
  });

  describe('getById()', () => {
    it('returns the user when found', async () => {
      repository.findById.mockResolvedValue(makeUser());
      await expect(service.getById(FAKE_DB, 'user-1')).resolves.toBeDefined();
    });

    it('throws NotFoundError when missing', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getById(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create()', () => {
    const validInput = { email: 'New@Example.com', password: 'longenoughpw', fullName: 'New User', roleId: 'role-1' };

    it('rejects a password shorter than 8 characters before touching the repository', async () => {
      await expect(
        service.create(FAKE_DB, { ...validInput, password: 'short' }, 'actor-1'),
      ).rejects.toThrow(/at least 8 characters/);
      expect(roles.findById).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the given roleId does not exist', async () => {
      roles.findById.mockResolvedValue(null);
      await expect(service.create(FAKE_DB, validInput, 'actor-1')).rejects.toThrow(NotFoundError);
    });

    it('lowercases/trims the email and hashes the password before calling the repository', async () => {
      roles.findById.mockResolvedValue(makeRole());
      repository.create.mockResolvedValue(makeUser({ email: 'new@example.com' }));

      await service.create(FAKE_DB, validInput, 'actor-1');

      expect(repository.create).toHaveBeenCalledWith(FAKE_DB, {
        email: 'new@example.com',
        passwordHash: 'hashed:longenoughpw',
        fullName: 'New User',
        roleId: 'role-1',
        isActive: true,
      });
    });

    it('records an audit log entry on success', async () => {
      roles.findById.mockResolvedValue(makeRole());
      const created = makeUser({ email: 'new@example.com' });
      repository.create.mockResolvedValue(created);

      await service.create(FAKE_DB, validInput, 'actor-1');

      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ userId: 'actor-1', action: 'user.created', entityId: created.id }),
      );
    });

    it('translates a unique-violation on email into ConflictError', async () => {
      roles.findById.mockResolvedValue(makeRole());
      repository.create.mockRejectedValue(uniqueViolation());

      await expect(service.create(FAKE_DB, validInput, 'actor-1')).rejects.toThrow(ConflictError);
      await expect(service.create(FAKE_DB, validInput, 'actor-1')).rejects.toThrow(
        /A user with email "new@example.com" already exists\./,
      );
    });
  });

  describe('update()', () => {
    it('throws NotFoundError when a given roleId does not exist', async () => {
      roles.findById.mockResolvedValue(null);
      await expect(
        service.update(FAKE_DB, 'user-1', { roleId: 'missing-role' }, 'actor-1'),
      ).rejects.toThrow(NotFoundError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('refuses to let a user deactivate their own account', async () => {
      await expect(
        service.update(FAKE_DB, 'user-1', { isActive: false }, 'user-1'),
      ).rejects.toThrow(/cannot deactivate your own account/);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('allows deactivating a DIFFERENT user', async () => {
      repository.update.mockResolvedValue(makeUser({ id: 'user-2', isActive: false }));
      await expect(
        service.update(FAKE_DB, 'user-2', { isActive: false }, 'actor-1'),
      ).resolves.toBeDefined();
    });

    it('throws NotFoundError when the repository returns null', async () => {
      repository.update.mockResolvedValue(null);
      await expect(service.update(FAKE_DB, 'missing', { fullName: 'X' }, 'actor-1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('records an audit log entry on success', async () => {
      const updated = makeUser({ fullName: 'Renamed' });
      repository.update.mockResolvedValue(updated);

      await service.update(FAKE_DB, 'user-1', { fullName: 'Renamed' }, 'actor-1');

      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ userId: 'actor-1', action: 'user.updated', entityId: 'user-1' }),
      );
    });
  });

  describe('changeOwnPassword()', () => {
    it('rejects a new password shorter than 8 characters up front', async () => {
      await expect(
        service.changeOwnPassword(FAKE_DB, 'user-1', 'whatever', 'short'),
      ).rejects.toThrow(/at least 8 characters/);
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the user no longer exists', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        service.changeOwnPassword(FAKE_DB, 'missing', 'whatever12', 'newlongpassword'),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects an incorrect current password without touching updatePasswordHash', async () => {
      repository.findById.mockResolvedValue(makeUser());
      repository.findByEmailForAuth.mockResolvedValue({ ...makeUser(), passwordHash: 'hashed:realpassword' });

      await expect(
        service.changeOwnPassword(FAKE_DB, 'user-1', 'wrongpassword', 'newlongpassword'),
      ).rejects.toThrow(/Current password is incorrect\./);
      expect(repository.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('hashes and stores the new password, and records an audit log entry, on success', async () => {
      repository.findById.mockResolvedValue(makeUser());
      repository.findByEmailForAuth.mockResolvedValue({ ...makeUser(), passwordHash: 'hashed:realpassword' });

      await service.changeOwnPassword(FAKE_DB, 'user-1', 'realpassword', 'newlongpassword');

      expect(bcrypt.hash).toHaveBeenCalledWith('newlongpassword', 12);
      expect(repository.updatePasswordHash).toHaveBeenCalledWith(FAKE_DB, 'user-1', 'hashed:newlongpassword');
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ userId: 'user-1', action: 'user.password_changed' }),
      );
    });
  });
});
