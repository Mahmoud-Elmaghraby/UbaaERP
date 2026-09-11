import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { JwtAccessPayload } from '../../../../shared/auth/jwt-payload.type';
import { USER_REPOSITORY, type UserRepository } from '../ports/user.repository';
import { ROLE_REPOSITORY, type RoleRepository } from '../ports/role.repository';
import { REFRESH_TOKEN_REPOSITORY, type RefreshTokenRepository } from '../ports/refresh-token.repository';
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from '../ports/audit-log.repository';
import {
  ACCOUNT_ACTION_TOKEN_REPOSITORY,
  type AccountActionTokenRepository,
} from '../ports/account-action-token.repository';
import { TwoFactorService } from './two-factor.service';
import { PlanResolverService } from '../../../../shared/plans/plan-resolver.service';
import { TenantFeatureTogglesRepository } from '../../../../shared/plans/tenant-feature-toggles.repository';
import { AuthenticationError } from '../errors';

const REFRESH_TOKEN_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);
const REFRESH_TOKEN_BYTES = 48;
const MFA_CHALLENGE_BYTES = 32;
const MFA_CHALLENGE_TTL_MINUTES = 5;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string; roleId: string };
}

/** login()'s alternative return shape when the account has TOTP 2FA
 * enabled: no tokens are issued yet — the caller must present the
 * `challengeToken` plus a valid code to AuthService.verifyTwoFactor()
 * before any session is created. */
export interface MfaChallenge {
  mfaRequired: true;
  challengeToken: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Login/refresh/logout for the JWT-based auth flow — an implementation
 * decision (see the migrations' and AuthInfraModule's comments), not
 * something the master document specifies. Uses NestJS's JwtService and
 * @Injectable()/@Inject() directly, same as every other service in this
 * codebase (see e.g. BranchesService) — the project's Clean Architecture
 * is pragmatic, not framework-agnostic-application-layer purist, so this
 * doesn't introduce a new pattern.
 *
 * Refresh-token transport (httpOnly cookie vs. response body) is
 * deliberately NOT this service's concern — it always returns the raw
 * refresh token value in AuthTokens, exactly as before. AuthController
 * decides what to do with it (sets it as a cookie, per claude/settings-
 * module-audit.md §2.2/Task 9) so this layer stays free of any
 * HTTP-transport detail, per Clean Architecture §2.1.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogs: AuditLogRepository,
    @Inject(ACCOUNT_ACTION_TOKEN_REPOSITORY) private readonly actionTokens: AccountActionTokenRepository,
    private readonly twoFactor: TwoFactorService,
    private readonly plans: PlanResolverService,
    private readonly featureToggles: TenantFeatureTogglesRepository,
  ) {}

  async login(
    db: Kysely<TenantDatabase>,
    schema: string,
    email: string,
    password: string,
  ): Promise<AuthTokens | MfaChallenge> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.users.findByEmailForAuth(db, normalizedEmail);
    if (!user || !user.isActive) {
      // Audited even though the user may not exist / may be inactive —
      // this is exactly the signal a brute-force or credential-stuffing
      // attempt would otherwise leave zero trace of (previously only
      // successful logins were audited at all).
      await this.auditLogs.record(db, {
        userId: user?.id ?? null,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user?.id ?? null,
        metadata: { email: normalizedEmail, reason: user ? 'inactive' : 'not_found' },
      });
      throw new AuthenticationError('Invalid email or password.', { code: 'AUTH.INVALID_CREDENTIALS' });
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      await this.auditLogs.record(db, {
        userId: user.id,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        metadata: { email: normalizedEmail, reason: 'wrong_password' },
      });
      throw new AuthenticationError('Invalid email or password.', { code: 'AUTH.INVALID_CREDENTIALS' });
    }

    if (user.totpEnabled) {
      // Correct password proven, but no session yet — a second factor
      // is still required. The challenge ticket binds that second step
      // to THIS specific, already-password-verified attempt: an
      // attacker who doesn't have the password can't call verifyTwoFactor()
      // directly without one (see account_action_tokens' 'mfa_challenge'
      // purpose, migration 0068). No auth.login audit yet — that happens
      // only once verifyTwoFactor() actually succeeds.
      const challengeTokenPlain = randomBytes(MFA_CHALLENGE_BYTES).toString('hex');
      const expiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_MINUTES * 60 * 1000);
      await this.actionTokens.create(db, user.id, hashToken(challengeTokenPlain), 'mfa_challenge', expiresAt);
      return { mfaRequired: true, challengeToken: challengeTokenPlain };
    }

    const tokens = await this.issueTokens(db, schema, user.id, user.roleId);
    await this.auditLogs.record(db, {
      userId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      metadata: {},
    });
    return {
      ...tokens,
      user: { id: user.id, email: user.email, fullName: user.fullName, roleId: user.roleId },
    };
  }

  /**
   * The second login step for an account with TOTP enabled — redeems
   * the challenge from login() plus a TOTP or backup code (delegated to
   * TwoFactorService.verifyLoginCode()) and, on success, issues tokens
   * exactly like a normal password-only login would have.
   */
  async verifyTwoFactor(
    db: Kysely<TenantDatabase>,
    schema: string,
    challengeTokenPlain: string,
    code: string,
  ): Promise<AuthTokens> {
    const record = await this.actionTokens.findValidByHash(db, hashToken(challengeTokenPlain), 'mfa_challenge');
    if (!record) {
      throw new AuthenticationError('Invalid or expired verification session — please log in again.', {
        code: 'AUTH.INVALID_MFA_SESSION',
      });
    }
    // Single-use regardless of outcome: a challenge ticket that failed
    // one code attempt is not retried — the caller must go back through
    // login() (with the password again) for a fresh one. This bounds
    // how many codes an attacker who somehow obtained a challenge token
    // (without the password) can try against it to exactly one.
    await this.actionTokens.markUsed(db, record.id);

    const user = await this.users.findById(db, record.userId);
    if (!user || !user.isActive) {
      throw new AuthenticationError('Invalid or expired verification session — please log in again.', {
        code: 'AUTH.INVALID_MFA_SESSION',
      });
    }

    const valid = await this.twoFactor.verifyLoginCode(db, user.id, code);
    if (!valid) {
      await this.auditLogs.record(db, {
        userId: user.id,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        metadata: { reason: 'invalid_2fa_code' },
      });
      throw new AuthenticationError('Invalid verification code.', { code: 'AUTH.INVALID_VERIFICATION_CODE' });
    }

    const tokens = await this.issueTokens(db, schema, user.id, user.roleId);
    await this.auditLogs.record(db, {
      userId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      metadata: { via: '2fa' },
    });
    return {
      ...tokens,
      user: { id: user.id, email: user.email, fullName: user.fullName, roleId: user.roleId },
    };
  }

  async refresh(db: Kysely<TenantDatabase>, schema: string, refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(refreshToken);
    const record = await this.refreshTokens.findByHash(db, tokenHash);
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new AuthenticationError('Invalid or expired refresh token.', { code: 'AUTH.INVALID_REFRESH_TOKEN' });
    }
    // Rotation: each refresh token is single-use. Revoke it before
    // issuing a new pair, so a leaked/replayed token can't be reused.
    await this.refreshTokens.revoke(db, tokenHash);

    const user = await this.users.findById(db, record.userId);
    if (!user || !user.isActive) {
      throw new AuthenticationError('Invalid or expired refresh token.', { code: 'AUTH.INVALID_REFRESH_TOKEN' });
    }

    const tokens = await this.issueTokens(db, schema, user.id, user.roleId);
    return {
      ...tokens,
      user: { id: user.id, email: user.email, fullName: user.fullName, roleId: user.roleId },
    };
  }

  async logout(db: Kysely<TenantDatabase>, refreshToken: string): Promise<void> {
    await this.refreshTokens.revoke(db, hashToken(refreshToken));
  }

  private async issueTokens(
    db: Kysely<TenantDatabase>,
    schema: string,
    userId: string,
    roleId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const [role, features, disabledFeatures] = await Promise.all([
      this.roles.findById(db, roleId),
      this.plans.resolveFeatureKeysForSchema(schema),
      this.featureToggles.listDisabledFeatureKeys(db),
    ]);
    const permissions = role?.permissionKeys ?? [];

    const payload: JwtAccessPayload = {
      sub: userId,
      schema,
      roleId,
      permissions,
      features,
      disabledFeatures,
    };
    const accessToken = this.jwtService.sign(payload);

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.refreshTokens.create(db, userId, hashToken(refreshToken), expiresAt);

    return { accessToken, refreshToken };
  }
}
