import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { UserBranchAccessRepository } from '../ports/user-branch-access.repository';
import type { AuditLogRepository } from '../ports/audit-log.repository';
import { ConflictError } from '../errors';
import { UserBranchAccessService } from './user-branch-access.service';

const FAKE_DB = {} as Kysely<TenantDatabase>;

function foreignKeyViolation(): Error {
  return Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
}

describe('UserBranchAccessService', () => {
  let repository: jest.Mocked<UserBranchAccessRepository>;
  let auditLogs: jest.Mocked<AuditLogRepository>;
  let service: UserBranchAccessService;

  beforeEach(() => {
    repository = { listBranchIdsForUser: jest.fn(), setForUser: jest.fn() };
    auditLogs = { record: jest.fn(), list: jest.fn() };
    service = new UserBranchAccessService(repository, auditLogs);
  });

  it('listForUser() delegates to the repository', async () => {
    repository.listBranchIdsForUser.mockResolvedValue(['branch-1', 'branch-2']);
    await expect(service.listForUser(FAKE_DB, 'user-1')).resolves.toEqual(['branch-1', 'branch-2']);
    expect(repository.listBranchIdsForUser).toHaveBeenCalledWith(FAKE_DB, 'user-1');
  });

  describe('setForUser()', () => {
    it('records an audit log entry with the new branch list on success', async () => {
      repository.setForUser.mockResolvedValue(undefined);

      await service.setForUser(FAKE_DB, 'user-1', ['branch-1', 'branch-2'], 'actor-1');

      expect(repository.setForUser).toHaveBeenCalledWith(FAKE_DB, 'user-1', ['branch-1', 'branch-2']);
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({
          userId: 'actor-1',
          action: 'user.branch_access_set',
          entityType: 'user',
          entityId: 'user-1',
          metadata: { branchIds: ['branch-1', 'branch-2'] },
        }),
      );
    });

    it('translates a foreign-key violation into ConflictError and records no audit log', async () => {
      repository.setForUser.mockRejectedValue(foreignKeyViolation());

      await expect(
        service.setForUser(FAKE_DB, 'user-1', ['does-not-exist'], 'actor-1'),
      ).rejects.toThrow(ConflictError);
      expect(auditLogs.record).not.toHaveBeenCalled();
    });

    it('rethrows any other error unchanged', async () => {
      const unrelated = new Error('connection reset');
      repository.setForUser.mockRejectedValue(unrelated);
      await expect(service.setForUser(FAKE_DB, 'user-1', [], 'actor-1')).rejects.toBe(unrelated);
    });
  });
});
