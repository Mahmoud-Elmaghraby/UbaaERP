import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from '../ports/audit-log.repository';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

/**
 * Per-account lockout after repeated wrong passwords — the per-IP throttle alone doesn't stop a
 * spray from many addresses, and on the desktop build every attempt comes from the same address.
 *
 * Read straight from the audit log (no counter column to keep in sync): MAX_FAILED_LOGINS
 * wrong-password attempts within LOCKOUT_MINUTES, counted since the last successful sign-in,
 * password reset/set or unlock, lock the account until LOCKOUT_MINUTES after the last of them.
 * Attempts made while locked are logged with reason 'locked' and don't extend the lock.
 */
@Injectable()
export class LoginLockoutService {
  constructor(@Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogs: AuditLogRepository) {}

  /** When the account unlocks, or null when it isn't locked. */
  async lockedUntil(db: Kysely<TenantDatabase>, userId: string, now = new Date()): Promise<Date | null> {
    const windowStart = new Date(now.getTime() - LOCKOUT_MINUTES * 60_000);
    const failures = await this.auditLogs.recentLoginFailures(db, userId, windowStart);
    if (failures.length < MAX_FAILED_LOGINS) return null;
    const until = new Date(failures[0]!.getTime() + LOCKOUT_MINUTES * 60_000);
    return until > now ? until : null;
  }
}
