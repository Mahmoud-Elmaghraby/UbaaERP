import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { AppSettingsRepository } from '../../../../shared/app-settings/app-settings.repository';
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from '../ports/audit-log.repository';

/**
 * Per-account lockout after repeated wrong passwords — the per-IP throttle alone doesn't stop a
 * spray from many addresses, and on the desktop build every attempt comes from the same address.
 *
 * Read straight from the audit log (no counter column to keep in sync): `security.lockoutMaxAttempts`
 * wrong-password attempts within `security.lockoutMinutes` (settings hub; 5 and 15 by default),
 * counted since the last successful sign-in, password reset/set or unlock, lock the account until
 * that many minutes after the last of them. Attempts made while locked are logged with reason
 * 'locked' and don't extend the lock.
 */
@Injectable()
export class LoginLockoutService {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogs: AuditLogRepository,
    private readonly settings: AppSettingsRepository,
  ) {}

  /** When the account unlocks, or null when it isn't locked. */
  async lockedUntil(db: Kysely<TenantDatabase>, userId: string, now = new Date()): Promise<Date | null> {
    const [maxAttempts, minutes] = await Promise.all([
      this.settings.get(db, 'security.lockoutMaxAttempts'),
      this.settings.get(db, 'security.lockoutMinutes'),
    ]);
    const windowStart = new Date(now.getTime() - minutes * 60_000);
    const failures = await this.auditLogs.recentLoginFailures(db, userId, windowStart);
    if (failures.length < maxAttempts) return null;
    const until = new Date(failures[0]!.getTime() + minutes * 60_000);
    return until > now ? until : null;
  }
}
