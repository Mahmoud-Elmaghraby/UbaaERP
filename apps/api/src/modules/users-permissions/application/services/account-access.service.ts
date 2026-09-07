import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { USER_REPOSITORY, type UserRepository } from '../ports/user.repository';
import {
  ACCOUNT_ACTION_TOKEN_REPOSITORY,
  type AccountActionTokenRepository,
} from '../ports/account-action-token.repository';
import { REFRESH_TOKEN_REPOSITORY, type RefreshTokenRepository } from '../ports/refresh-token.repository';
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from '../ports/audit-log.repository';
import { EMAIL_SENDER, type EmailSenderPort } from '../../../../shared/email/email-sender.port';
import type { AccountActionTokenPurpose } from '../../domain/account-action-token.entity';
import { AuthenticationError, NotFoundError } from '../errors';

const RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TTL_HOURS = 1;
const INVITE_TTL_DAYS = 7;
const BCRYPT_ROUNDS = 12;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function buildTokenEmailBody(purpose: AccountActionTokenPurpose, token: string): string {
  // The frontend route that redeems this token is deliberately not
  // assembled into a clickable URL here — there is no decided/available
  // WEB_APP_URL env var yet (CLAUDE.md §12: production web hosting, and
  // therefore the real frontend origin, is still an open decision). The
  // raw token is emailed instead so a real template/link can be wired
  // in later without touching this service's logic at all — only
  // ConsoleEmailSender needs replacing with a real provider, per its
  // own class comment.
  const action = purpose === 'invite' ? 'لإعداد حسابك' : 'لإعادة تعيين كلمة المرور';
  return `استخدم الرمز التالي ${action}:\n\n${token}\n\nصالح لفترة محدودة، ولا يمكن استخدامه أكثر من مرة.`;
}

/**
 * "Forgot password" + "accept an admin's invite" — see
 * claude/settings-module-audit.md §2.3/§2.4 for why these were missing
 * and account-action-token.repository.ts's comment for why they share
 * one token table. Kept as its own service rather than folded into
 * AuthService/UsersService: it touches users, tokens, refresh_tokens,
 * audit_logs, AND the (new) email port all at once, and neither
 * existing service currently depends on EmailSenderPort.
 */
@Injectable()
export class AccountAccessService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ACCOUNT_ACTION_TOKEN_REPOSITORY) private readonly tokens: AccountActionTokenRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogs: AuditLogRepository,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSenderPort,
  ) {}

  /**
   * Always resolves, whether or not the email matches a real, active
   * user — the caller is unauthenticated by definition (they're asking
   * because they can't log in), so returning a different result for
   * "unknown email" vs. "known email, reset sent" would let anyone
   * enumerate which emails have accounts. The controller always
   * responds with the same generic 204 regardless of what happens here.
   */
  async requestPasswordReset(db: Kysely<TenantDatabase>, email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.users.findByEmailForAuth(db, normalizedEmail);
    if (!user || !user.isActive) return;

    const token = randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000);
    await this.tokens.create(db, user.id, hashToken(token), 'password_reset', expiresAt);

    await this.emailSender.send({
      to: user.email,
      subject: 'إعادة تعيين كلمة المرور',
      body: buildTokenEmailBody('password_reset', token),
    });

    await this.auditLogs.record(db, {
      userId: user.id,
      action: 'auth.password_reset_requested',
      entityType: 'user',
      entityId: user.id,
      metadata: {},
    });
  }

  /**
   * Admin action (users.manage): sends a fresh invite token so a
   * user — typically one just created by POST /users, where an admin
   * had to type SOME initial password to satisfy the schema — can set
   * their own real password before ever needing to know or use the
   * admin-set one.
   */
  async sendInvite(db: Kysely<TenantDatabase>, userId: string, actingUserId: string): Promise<void> {
    const user = await this.users.findById(db, userId);
    if (!user) throw new NotFoundError(`User "${userId}" not found.`);

    const token = randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.tokens.create(db, user.id, hashToken(token), 'invite', expiresAt);

    await this.emailSender.send({
      to: user.email,
      subject: 'دعوة لإعداد حسابك',
      body: buildTokenEmailBody('invite', token),
    });

    await this.auditLogs.record(db, {
      userId: actingUserId,
      action: 'user.invited',
      entityType: 'user',
      entityId: user.id,
      metadata: {},
    });
  }

  /**
   * Redeems a token from EITHER flow. The public endpoint deliberately
   * doesn't ask the caller which purpose their token is for — it was
   * only ever issued for one, so trying both lookups is safe and keeps
   * the API to a single "I have a token and a new password" action
   * instead of two near-identical endpoints a frontend would have to
   * pick between.
   */
  async consumeToken(db: Kysely<TenantDatabase>, tokenPlain: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(tokenPlain);
    const record =
      (await this.tokens.findValidByHash(db, tokenHash, 'password_reset')) ??
      (await this.tokens.findValidByHash(db, tokenHash, 'invite'));
    if (!record) {
      throw new AuthenticationError('Invalid or expired token.');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.users.updatePasswordHash(db, record.userId, passwordHash);
    await this.tokens.markUsed(db, record.id);
    // Force re-login everywhere with the new password — mirrors
    // UsersService.update()'s deactivation behavior: a session using the
    // OLD password (or, for an invite, the admin-set temporary one)
    // should not silently keep working past this point.
    await this.refreshTokens.revokeAllForUser(db, record.userId);

    await this.auditLogs.record(db, {
      userId: record.userId,
      action: record.purpose === 'invite' ? 'user.invite_accepted' : 'auth.password_reset_completed',
      entityType: 'user',
      entityId: record.userId,
      metadata: {},
    });
  }
}
