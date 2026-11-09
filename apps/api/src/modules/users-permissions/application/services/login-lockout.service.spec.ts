import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { AppSettingsRepository } from '../../../../shared/app-settings/app-settings.repository';
import type { AuditLogRepository } from '../ports/audit-log.repository';
import { LoginLockoutService } from './login-lockout.service';

const DB = {} as Kysely<TenantDatabase>;

describe('LoginLockoutService', () => {
  const now = new Date('2026-11-08T10:00:00Z');
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  function service(failures: Date[], maxAttempts = 5, minutes = 15) {
    const repo = { recentLoginFailures: jest.fn().mockResolvedValue(failures) } as unknown as AuditLogRepository;
    const settings = {
      get: jest.fn((_db: unknown, key: string) => Promise.resolve(key === 'security.lockoutMaxAttempts' ? maxAttempts : minutes)),
    } as unknown as AppSettingsRepository;
    return { lockout: new LoginLockoutService(repo, settings), repo };
  }

  it('is not locked below the limit', async () => {
    const failures = Array.from({ length: 4 }, (_, i) => minutesAgo(i));
    expect(await service(failures).lockout.lockedUntil(DB, 'u', now)).toBeNull();
  });

  it('locks for the configured minutes after the latest failure once the limit is reached', async () => {
    const failures = Array.from({ length: 5 }, (_, i) => minutesAgo(i + 2));
    const until = await service(failures).lockout.lockedUntil(DB, 'u', now);
    expect(until?.toISOString()).toBe(new Date(minutesAgo(2).getTime() + 15 * 60_000).toISOString());
  });

  it('follows the settings hub (3 attempts, 60 minutes)', async () => {
    const failures = Array.from({ length: 3 }, (_, i) => minutesAgo(i + 1));
    const { lockout, repo } = service(failures, 3, 60);
    const until = await lockout.lockedUntil(DB, 'u', now);
    expect(until?.toISOString()).toBe(new Date(minutesAgo(1).getTime() + 60 * 60_000).toISOString());
    expect((repo.recentLoginFailures as jest.Mock).mock.calls[0][2]).toEqual(minutesAgo(60));
  });
});
