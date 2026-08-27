import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { AuditLogRepository } from '../ports/audit-log.repository';
import { AuditLogsService } from './audit-logs.service';

const FAKE_DB = {} as Kysely<TenantDatabase>;

function makeMockRepository(): jest.Mocked<AuditLogRepository> {
  return { record: jest.fn(), list: jest.fn().mockResolvedValue([]) };
}

describe('AuditLogsService', () => {
  let repository: jest.Mocked<AuditLogRepository>;
  let service: AuditLogsService;

  beforeEach(() => {
    repository = makeMockRepository();
    service = new AuditLogsService(repository);
  });

  it('applies the default limit (50) and offset (0) when none are given', async () => {
    await service.list(FAKE_DB, {});
    expect(repository.list).toHaveBeenCalledWith(FAKE_DB, {}, 50, 0);
  });

  it('clamps a limit above the 200 maximum down to 200', async () => {
    await service.list(FAKE_DB, {}, 5000);
    expect(repository.list).toHaveBeenCalledWith(FAKE_DB, {}, 200, 0);
  });

  it('clamps a limit below 1 up to 1', async () => {
    await service.list(FAKE_DB, {}, -10);
    expect(repository.list).toHaveBeenCalledWith(FAKE_DB, {}, 1, 0);
  });

  it('clamps a negative offset up to 0', async () => {
    await service.list(FAKE_DB, {}, 50, -5);
    expect(repository.list).toHaveBeenCalledWith(FAKE_DB, {}, 50, 0);
  });

  it('passes filters through unchanged', async () => {
    const filters = { entityType: 'user', action: 'user.created' };
    await service.list(FAKE_DB, filters, 10, 20);
    expect(repository.list).toHaveBeenCalledWith(FAKE_DB, filters, 10, 20);
  });
});
