import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { USER_REPOSITORY, type UserRepository } from '../ports/user.repository';
import { BACKUP_CODE_REPOSITORY, type BackupCodeRepository } from '../ports/backup-code.repository';
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from '../ports/audit-log.repository';
import { SecretsEncryptionService } from '../../../../shared/crypto/secrets-encryption.service';
import { TotpService } from './totp.service';
import { AuthenticationError, ConflictError, NotFoundError } from '../errors';

const BACKUP_CODE_COUNT = 8;

function hashBackupCode(code: string): string {
  // Backup codes are single-use and high-entropy (32 random bits each,
  // 8 hex characters) and are only ever compared for exact equality —
  // a fast SHA-256 lookup hash is appropriate here, the same reasoning
  // already used for refresh_tokens/account_action_tokens (unlike
  // passwords, there is no low-entropy-guessing risk a slow hash like
  // bcrypt would mitigate).
  return createHash('sha256').update(code).digest('hex');
}

function normalizeBackupCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-F0-9]/g, '');
}

function generateBackupCode(): string {
  const raw = randomBytes(4).toString('hex').toUpperCase(); // 8 hex chars, 32 bits.
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/**
 * Optional, per-user TOTP two-factor authentication (claude/settings-
 * module-audit.md §2.5, Task 8) — modeled on Odoo's approach: opt-in
 * per user, not an org-wide mandatory setting. A mandatory rollout would
 * need its own enforcement/exception design (e.g. what happens to a
 * locked-out Owner) — a real product decision deliberately left open,
 * not invented here.
 *
 * Setup is two steps on purpose: initiateSetup() only stores a PENDING
 * secret (`totp_enabled` stays false), so a user who scans the QR code
 * but never finishes (closes the tab, app crashes) has not silently put
 * their account into a broken 2FA state — confirmSetup() is what
 * actually flips totp_enabled to true, and only once the secret has
 * been proven to work.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(BACKUP_CODE_REPOSITORY) private readonly backupCodes: BackupCodeRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogs: AuditLogRepository,
    private readonly secrets: SecretsEncryptionService,
    private readonly totp: TotpService,
  ) {}

  /** Whether 2FA is currently enabled for this user — the only TOTP
   * state the frontend is ever allowed to see (never the secret, pending
   * or otherwise); used so the profile page can render "enable" vs
   * "disable" without needing a `totp_enabled` column exposed on the
   * general user profile/list endpoints. */
  async getStatus(db: Kysely<TenantDatabase>, userId: string): Promise<{ enabled: boolean }> {
    const state = await this.users.getTotpState(db, userId);
    return { enabled: state.enabled };
  }

  async initiateSetup(
    db: Kysely<TenantDatabase>,
    userId: string,
    email: string,
  ): Promise<{ secret: string; otpauthUri: string }> {
    const state = await this.users.getTotpState(db, userId);
    if (state.enabled) {
      throw new ConflictError('Two-factor authentication is already enabled for this account.');
    }

    const secret = this.totp.generateSecret();
    await this.users.setPendingTotpSecret(db, userId, this.secrets.encrypt(secret));

    return { secret, otpauthUri: this.totp.buildOtpauthUri(secret, email) };
  }

  async confirmSetup(
    db: Kysely<TenantDatabase>,
    userId: string,
    code: string,
  ): Promise<{ backupCodes: string[] }> {
    const state = await this.users.getTotpState(db, userId);
    if (state.enabled) {
      throw new ConflictError('Two-factor authentication is already enabled for this account.');
    }
    if (!state.secretEncrypted) {
      throw new ConflictError('No two-factor setup is in progress for this account — call setup first.');
    }

    const secret = this.secrets.decrypt(state.secretEncrypted);
    if (!this.totp.verifyCode(secret, code)) {
      throw new AuthenticationError('Invalid verification code.');
    }

    await this.users.enableTotp(db, userId);

    const plainCodes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
    await this.backupCodes.replaceAll(
      db,
      userId,
      plainCodes.map((plainCode) => hashBackupCode(normalizeBackupCode(plainCode))),
    );

    await this.auditLogs.record(db, {
      userId,
      action: 'user.2fa_enabled',
      entityType: 'user',
      entityId: userId,
      metadata: {},
    });

    // Shown to the caller exactly once — neither this service nor the
    // database ever exposes them again after this call returns (only
    // their hashes are stored).
    return { backupCodes: plainCodes };
  }

  async disable(db: Kysely<TenantDatabase>, userId: string, currentPassword: string): Promise<void> {
    const user = await this.users.findById(db, userId);
    if (!user) throw new NotFoundError(`User "${userId}" not found.`);

    const authRecord = await this.users.findByEmailForAuth(db, user.email);
    if (!authRecord) throw new NotFoundError(`User "${userId}" not found.`);

    const matches = await bcrypt.compare(currentPassword, authRecord.passwordHash);
    if (!matches) throw new ConflictError('Current password is incorrect.');

    await this.users.disableTotp(db, userId);
    await this.backupCodes.deleteAllForUser(db, userId);

    await this.auditLogs.record(db, {
      userId,
      action: 'user.2fa_disabled',
      entityType: 'user',
      entityId: userId,
      metadata: {},
    });
  }

  /**
   * Used only by AuthService's second login step (verifyTwoFactor) —
   * tries a live TOTP code first, then falls back to a single-use
   * backup code ("I lost my phone"). Returns false rather than throwing
   * on any failure; AuthService decides what that means for the login
   * attempt and audits it accordingly, the same separation already used
   * for AuthService.login()'s own bcrypt.compare() check.
   */
  async verifyLoginCode(db: Kysely<TenantDatabase>, userId: string, code: string): Promise<boolean> {
    const state = await this.users.getTotpState(db, userId);
    if (!state.enabled || !state.secretEncrypted) return false;

    const secret = this.secrets.decrypt(state.secretEncrypted);
    if (this.totp.verifyCode(secret, code)) return true;

    const normalized = normalizeBackupCode(code);
    if (normalized.length !== 8) return false;
    return this.backupCodes.consume(db, userId, hashBackupCode(normalized));
  }
}
