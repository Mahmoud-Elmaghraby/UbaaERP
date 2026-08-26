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
import { AuthenticationError } from '../errors';

const REFRESH_TOKEN_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);
const REFRESH_TOKEN_BYTES = 48;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string; roleId: string };
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
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogs: AuditLogRepository,
  ) {}

  async login(
    db: Kysely<TenantDatabase>,
    schema: string,
    email: string,
    password: string,
  ): Promise<AuthTokens> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.users.findByEmailForAuth(db, normalizedEmail);
    if (!user || !user.isActive) {
      throw new AuthenticationError('Invalid email or password.');
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new AuthenticationError('Invalid email or password.');
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

  async refresh(db: Kysely<TenantDatabase>, schema: string, refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(refreshToken);
    const record = await this.refreshTokens.findByHash(db, tokenHash);
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new AuthenticationError('Invalid or expired refresh token.');
    }
    // Rotation: each refresh token is single-use. Revoke it before
    // issuing a new pair, so a leaked/replayed token can't be reused.
    await this.refreshTokens.revoke(db, tokenHash);

    const user = await this.users.findById(db, record.userId);
    if (!user || !user.isActive) {
      throw new AuthenticationError('Invalid or expired refresh token.');
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
    const role = await this.roles.findById(db, roleId);
    const permissions = role?.permissionKeys ?? [];

    const payload: JwtAccessPayload = { sub: userId, schema, roleId, permissions };
    const accessToken = this.jwtService.sign(payload);

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.refreshTokens.create(db, userId, hashToken(refreshToken), expiresAt);

    return { accessToken, refreshToken };
  }
}
