import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PermissionRepository } from '../ports/permission.repository';
import type { Permission } from '../../domain/permission.entity';
import { PermissionsService } from './permissions.service';

const FAKE_DB = {} as Kysely<TenantDatabase>;

describe('PermissionsService', () => {
  it('list() delegates straight to the repository', async () => {
    const permissions: Permission[] = [
      { id: 'p1', key: 'settings.manage', description: 'Manage settings', createdAt: new Date() },
    ];
    const repository: jest.Mocked<PermissionRepository> = { list: jest.fn().mockResolvedValue(permissions) };
    const service = new PermissionsService(repository);

    await expect(service.list(FAKE_DB)).resolves.toBe(permissions);
    expect(repository.list).toHaveBeenCalledWith(FAKE_DB);
  });
});
