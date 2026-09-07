import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { ApprovalChainRepository } from '../ports/approval-chain.repository';
import type { UserRepository } from '../ports/user.repository';
import type { AuditLogRepository } from '../ports/audit-log.repository';
import type { User } from '../../domain/user.entity';
import { ConflictError, NotFoundError } from '../errors';
import { ApprovalChainsService } from './approval-chains.service';

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

describe('ApprovalChainsService', () => {
  let repository: jest.Mocked<ApprovalChainRepository>;
  let users: jest.Mocked<UserRepository>;
  let auditLogs: jest.Mocked<AuditLogRepository>;
  let service: ApprovalChainsService;

  beforeEach(() => {
    repository = { getManagerId: jest.fn(), setManager: jest.fn() };
    users = {
      list: jest.fn(),
      findById: jest.fn(),
      findByEmailForAuth: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updatePasswordHash: jest.fn(),
      getTotpState: jest.fn(),
      setPendingTotpSecret: jest.fn(),
      enableTotp: jest.fn(),
      disableTotp: jest.fn(),
    };
    auditLogs = { record: jest.fn(), list: jest.fn() };
    service = new ApprovalChainsService(repository, users, auditLogs);
  });

  it('getManagerId() delegates to the repository', async () => {
    repository.getManagerId.mockResolvedValue('manager-1');
    await expect(service.getManagerId(FAKE_DB, 'user-1')).resolves.toBe('manager-1');
  });

  describe('setManager()', () => {
    it('rejects a user being set as their own manager without looking either user up', async () => {
      await expect(service.setManager(FAKE_DB, 'user-1', 'user-1', 'actor-1')).rejects.toThrow(
        ConflictError,
      );
      await expect(service.setManager(FAKE_DB, 'user-1', 'user-1', 'actor-1')).rejects.toThrow(
        /cannot be their own manager/,
      );
      expect(users.findById).not.toHaveBeenCalled();
      expect(repository.setManager).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the target user does not exist', async () => {
      users.findById.mockResolvedValue(null);
      await expect(service.setManager(FAKE_DB, 'missing-user', null, 'actor-1')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the given manager does not exist', async () => {
      users.findById
        .mockResolvedValueOnce(makeUser({ id: 'user-1' })) // the target user
        .mockResolvedValueOnce(null); // the manager lookup

      await expect(service.setManager(FAKE_DB, 'user-1', 'missing-manager', 'actor-1')).rejects.toThrow(
        NotFoundError,
      );
      expect(repository.setManager).not.toHaveBeenCalled();
    });

    it('allows clearing the manager (null) without a second user lookup', async () => {
      users.findById.mockResolvedValue(makeUser({ id: 'user-1' }));

      await service.setManager(FAKE_DB, 'user-1', null, 'actor-1');

      expect(users.findById).toHaveBeenCalledTimes(1);
      expect(repository.setManager).toHaveBeenCalledWith(FAKE_DB, 'user-1', null);
    });

    it('sets the manager and records an audit log entry on success', async () => {
      users.findById
        .mockResolvedValueOnce(makeUser({ id: 'user-1' }))
        .mockResolvedValueOnce(makeUser({ id: 'manager-1' }));

      await service.setManager(FAKE_DB, 'user-1', 'manager-1', 'actor-1');

      expect(repository.setManager).toHaveBeenCalledWith(FAKE_DB, 'user-1', 'manager-1');
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({
          userId: 'actor-1',
          action: 'user.manager_set',
          entityType: 'user',
          entityId: 'user-1',
          metadata: { managerId: 'manager-1' },
        }),
      );
    });
  });
});
