import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { AuditLogRepository } from '../ports/audit-log.repository';
import { LOCKOUT_MINUTES, LoginLockoutService, MAX_FAILED_LOGINS } from './login-lockout.service';

const DB = {} as Kysely<TenantDatabase>;

describe('LoginLockoutService', () => {
  const now = new Date('2026-11-08T10:00:00Z');
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  function service(failures: Date[]) {
    const repo = { recentLoginFailures: jest.fn().mockResolvedValue(failures) } as unknown as AuditLogRepository;
    return new LoginLockoutService(repo);
  }

  it('is not locked below the limit', async () => {
    const failures = Array.from({ length: MAX_FAILED_LOGINS - 1 }, (_, i) => minutesAgo(i));
    expect(await service(failures).lockedUntil(DB, 'u', now)).toBeNull();
  });

  it('locks for LOCKOUT_MINUTES after the latest failure once the limit is reached', async () => {
    const failures = Array.from({ length: MAX_FAILED_LOGINS }, (_, i) => minutesAgo(i + 2));
    const until = await service(failures).lockedUntil(DB, 'u', now);
    expect(until?.toISOString()).toBe(new Date(minutesAgo(2).getTime() + LOCKOUT_MINUTES * 60_000).toISOString());
  });
});
