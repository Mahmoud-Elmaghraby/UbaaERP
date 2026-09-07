import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { UserRepository, UserAuthRecord } from '../ports/user.repository';
import type { RoleRepository } from '../ports/role.repository';
import type { RefreshTokenRepository, RefreshTokenRecord } from '../ports/refresh-token.repository';
import type { AuditLogRepository } from '../ports/audit-log.repository';
import type { AccountActionTokenRepository } from '../ports/account-action-token.repository';
import type { AccountActionToken } from '../../domain/account-action-token.entity';
import type { Role } from '../../domain/role.entity';
import type { TwoFactorService } from './two-factor.service';
import { AuthenticationError } from '../errors';
import { AuthService, type MfaChallenge } from './auth.service';

jest.mock('bcryptjs', () => ({ compare: jest.fn() }));
import * as bcrypt from 'bcryptjs';

const FAKE_DB = {} as Kysely<TenantDatabase>;
const TEST_JWT_SECRET = 'unit-test-only-secret';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function makeAuthUser(overrides: Partial<UserAuthRecord> = {}): UserAuthRecord {
  return {
    id: 'user-1',
    email: 'owner@example.com',
    fullName: 'The Owner',
    roleId: 'role-owner',
    isActive: true,
    totpEnabled: false,
    passwordHash: 'stored-hash',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-owner',
    name: 'Owner',
    isSystem: true,
    permissionKeys: ['settings.manage', 'users.manage', 'roles.manage', 'audit_logs.view'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let users: jest.Mocked<UserRepository>;
  let roles: jest.Mocked<RoleRepository>;
  let refreshTokens: jest.Mocked<RefreshTokenRepository>;
  let auditLogs: jest.Mocked<AuditLogRepository>;
  let actionTokens: jest.Mocked<AccountActionTokenRepository>;
  let twoFactor: jest.Mocked<TwoFactorService>;
  let jwtService: JwtService;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    users = {
      list: jest.fn(),
      findById: jest.fn(),
      findByEmailForAuth: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updatePasswordHash: jest.fn(),
      getTotpState: jest.fn(),
      setPendingTotpSecret: jest.fn(),
      enableTotp: jest.fn(),
      disableTotp: jest.fn(),
    };
    roles = { list: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
    refreshTokens = { create: jest.fn(), findByHash: jest.fn(), revoke: jest.fn(), revokeAllForUser: jest.fn() };
    auditLogs = { record: jest.fn(), list: jest.fn() };
    actionTokens = { create: jest.fn(), findValidByHash: jest.fn(), markUsed: jest.fn() };
    twoFactor = { verifyLoginCode: jest.fn() } as unknown as jest.Mocked<TwoFactorService>;
    // A real JwtService (not a mock) — signing/verifying a real token is
    // the whole point of testing this service; only the repositories and
    // bcrypt are faked.
    jwtService = new JwtService({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '15m' } });
    service = new AuthService(jwtService, users, roles, refreshTokens, auditLogs, actionTokens, twoFactor);
  });

  describe('login()', () => {
    it('rejects when no user exists for the email, without calling bcrypt.compare', async () => {
      users.findByEmailForAuth.mockResolvedValue(null);

      await expect(service.login(FAKE_DB, 'acme', 'owner@example.com', 'whatever')).rejects.toThrow(
        AuthenticationError,
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('audits an "auth.login_failed" entry (userId null, reason not_found) for an unknown email', async () => {
      users.findByEmailForAuth.mockResolvedValue(null);

      await expect(service.login(FAKE_DB, 'acme', 'owner@example.com', 'whatever')).rejects.toThrow(
        AuthenticationError,
      );
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({
          userId: null,
          action: 'auth.login_failed',
          metadata: expect.objectContaining({ email: 'owner@example.com', reason: 'not_found' }),
        }),
      );
    });

    it('rejects an inactive user without calling bcrypt.compare', async () => {
      users.findByEmailForAuth.mockResolvedValue(makeAuthUser({ isActive: false }));

      await expect(service.login(FAKE_DB, 'acme', 'owner@example.com', 'whatever')).rejects.toThrow(
        AuthenticationError,
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('audits an "auth.login_failed" entry (reason inactive) for a deactivated user', async () => {
      users.findByEmailForAuth.mockResolvedValue(makeAuthUser({ isActive: false }));

      await expect(service.login(FAKE_DB, 'acme', 'owner@example.com', 'whatever')).rejects.toThrow(
        AuthenticationError,
      );
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({
          userId: 'user-1',
          action: 'auth.login_failed',
          metadata: expect.objectContaining({ reason: 'inactive' }),
        }),
      );
    });

    it('rejects a wrong password and never issues a refresh token', async () => {
      users.findByEmailForAuth.mockResolvedValue(makeAuthUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(FAKE_DB, 'acme', 'owner@example.com', 'wrong')).rejects.toThrow(
        AuthenticationError,
      );
      expect(refreshTokens.create).not.toHaveBeenCalled();
    });

    it('audits an "auth.login_failed" entry (reason wrong_password) for a bad password', async () => {
      users.findByEmailForAuth.mockResolvedValue(makeAuthUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(FAKE_DB, 'acme', 'owner@example.com', 'wrong')).rejects.toThrow(
        AuthenticationError,
      );
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({
          userId: 'user-1',
          action: 'auth.login_failed',
          metadata: expect.objectContaining({ reason: 'wrong_password' }),
        }),
      );
    });

    it('normalizes the email (trim + lowercase) before looking the user up', async () => {
      users.findByEmailForAuth.mockResolvedValue(makeAuthUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      roles.findById.mockResolvedValue(makeRole());

      await service.login(FAKE_DB, 'acme', '  Owner@Example.com  ', 'correct');

      expect(users.findByEmailForAuth).toHaveBeenCalledWith(FAKE_DB, 'owner@example.com');
    });

    it('issues a real, verifiable access token carrying sub/schema/roleId/permissions', async () => {
      users.findByEmailForAuth.mockResolvedValue(makeAuthUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      roles.findById.mockResolvedValue(makeRole());

      const result = (await service.login(FAKE_DB, 'acme', 'owner@example.com', 'correct')) as Exclude<
        Awaited<ReturnType<typeof service.login>>,
        MfaChallenge
      >;

      const payload = jwtService.verify(result.accessToken, { secret: TEST_JWT_SECRET });
      expect(payload).toMatchObject({
        sub: 'user-1',
        schema: 'acme',
        roleId: 'role-owner',
        permissions: ['settings.manage', 'users.manage', 'roles.manage', 'audit_logs.view'],
      });
    });

    it('stores the SHA-256 hash of the plaintext refresh token it returns — never the plaintext', async () => {
      users.findByEmailForAuth.mockResolvedValue(makeAuthUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      roles.findById.mockResolvedValue(makeRole());

      const result = (await service.login(FAKE_DB, 'acme', 'owner@example.com', 'correct')) as Exclude<
        Awaited<ReturnType<typeof service.login>>,
        MfaChallenge
      >;

      expect(refreshTokens.create).toHaveBeenCalledWith(
        FAKE_DB,
        'user-1',
        hashToken(result.refreshToken),
        expect.any(Date),
      );
    });

    it('records an "auth.login" audit log entry and returns the user summary', async () => {
      users.findByEmailForAuth.mockResolvedValue(makeAuthUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      roles.findById.mockResolvedValue(makeRole());

      const result = (await service.login(FAKE_DB, 'acme', 'owner@example.com', 'correct')) as Exclude<
        Awaited<ReturnType<typeof service.login>>,
        MfaChallenge
      >;

      expect(result.user).toEqual({
        id: 'user-1',
        email: 'owner@example.com',
        fullName: 'The Owner',
        roleId: 'role-owner',
      });
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ userId: 'user-1', action: 'auth.login', entityId: 'user-1' }),
      );
    });

    it('signs in with zero permissions when the role has none (defensive default)', async () => {
      users.findByEmailForAuth.mockResolvedValue(makeAuthUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      roles.findById.mockResolvedValue(null); // e.g. role deleted out from under a stale user row

      const result = (await service.login(FAKE_DB, 'acme', 'owner@example.com', 'correct')) as Exclude<
        Awaited<ReturnType<typeof service.login>>,
        MfaChallenge
      >;
      const payload = jwtService.verify(result.accessToken, { secret: TEST_JWT_SECRET });
      expect(payload.permissions).toEqual([]);
    });

    describe('when the account has TOTP enabled', () => {
      it('does NOT issue tokens or an "auth.login" audit entry, and returns an MFA challenge instead', async () => {
        users.findByEmailForAuth.mockResolvedValue(makeAuthUser({ totpEnabled: true }));
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        const result = await service.login(FAKE_DB, 'acme', 'owner@example.com', 'correct');

        expect(result).toEqual({ mfaRequired: true, challengeToken: expect.any(String) });
        expect(refreshTokens.create).not.toHaveBeenCalled();
        expect(auditLogs.record).not.toHaveBeenCalledWith(
          FAKE_DB,
          expect.objectContaining({ action: 'auth.login' }),
        );
      });

      it('stores the SHA-256 hash of the challenge token under the "mfa_challenge" purpose', async () => {
        users.findByEmailForAuth.mockResolvedValue(makeAuthUser({ totpEnabled: true }));
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        const result = (await service.login(FAKE_DB, 'acme', 'owner@example.com', 'correct')) as MfaChallenge;

        expect(actionTokens.create).toHaveBeenCalledWith(
          FAKE_DB,
          'user-1',
          hashToken(result.challengeToken),
          'mfa_challenge',
          expect.any(Date),
        );
      });
    });
  });

  describe('verifyTwoFactor()', () => {
    function validChallenge(overrides: Partial<AccountActionToken> = {}): AccountActionToken {
      return {
        id: 'challenge-1',
        userId: 'user-1',
        purpose: 'mfa_challenge',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        ...overrides,
      };
    }

    it('rejects an invalid or expired challenge token without ever checking the code', async () => {
      actionTokens.findValidByHash.mockResolvedValue(null);

      await expect(service.verifyTwoFactor(FAKE_DB, 'acme', 'bad-challenge', '123456')).rejects.toThrow(
        AuthenticationError,
      );
      expect(twoFactor.verifyLoginCode).not.toHaveBeenCalled();
    });

    it('marks the challenge used even before checking the code (single-use regardless of outcome)', async () => {
      actionTokens.findValidByHash.mockResolvedValue(validChallenge());
      users.findById.mockResolvedValue(makeAuthUser());
      twoFactor.verifyLoginCode.mockResolvedValue(false);

      await expect(service.verifyTwoFactor(FAKE_DB, 'acme', 'challenge', '000000')).rejects.toThrow(
        AuthenticationError,
      );
      expect(actionTokens.markUsed).toHaveBeenCalledWith(FAKE_DB, 'challenge-1');
    });

    it('rejects when the user backing the challenge no longer exists or is inactive', async () => {
      actionTokens.findValidByHash.mockResolvedValue(validChallenge());
      users.findById.mockResolvedValue(null);

      await expect(service.verifyTwoFactor(FAKE_DB, 'acme', 'challenge', '123456')).rejects.toThrow(
        AuthenticationError,
      );
    });

    it('audits "auth.login_failed" (reason invalid_2fa_code) and rejects on a wrong code', async () => {
      actionTokens.findValidByHash.mockResolvedValue(validChallenge());
      users.findById.mockResolvedValue(makeAuthUser());
      twoFactor.verifyLoginCode.mockResolvedValue(false);

      await expect(service.verifyTwoFactor(FAKE_DB, 'acme', 'challenge', '000000')).rejects.toThrow(
        AuthenticationError,
      );
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({
          userId: 'user-1',
          action: 'auth.login_failed',
          metadata: expect.objectContaining({ reason: 'invalid_2fa_code' }),
        }),
      );
      expect(refreshTokens.create).not.toHaveBeenCalled();
    });

    it('issues real tokens and an "auth.login" audit entry on a correct code', async () => {
      actionTokens.findValidByHash.mockResolvedValue(validChallenge());
      users.findById.mockResolvedValue(makeAuthUser());
      twoFactor.verifyLoginCode.mockResolvedValue(true);
      roles.findById.mockResolvedValue(makeRole());

      const result = await service.verifyTwoFactor(FAKE_DB, 'acme', 'challenge', '123456');

      const payload = jwtService.verify(result.accessToken, { secret: TEST_JWT_SECRET });
      expect(payload).toMatchObject({ sub: 'user-1', schema: 'acme', roleId: 'role-owner' });
      expect(refreshTokens.create).toHaveBeenCalledWith(
        FAKE_DB,
        'user-1',
        hashToken(result.refreshToken),
        expect.any(Date),
      );
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ userId: 'user-1', action: 'auth.login', metadata: { via: '2fa' } }),
      );
    });
  });

  describe('refresh()', () => {
    function activeTokenRecord(overrides: Partial<RefreshTokenRecord> = {}): RefreshTokenRecord {
      return {
        id: 'rt-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        ...overrides,
      };
    }

    it('rejects when no record matches the token hash', async () => {
      refreshTokens.findByHash.mockResolvedValue(null);
      await expect(service.refresh(FAKE_DB, 'acme', 'unknown-token')).rejects.toThrow(AuthenticationError);
    });

    it('rejects an already-revoked token', async () => {
      refreshTokens.findByHash.mockResolvedValue(activeTokenRecord({ revokedAt: new Date() }));
      await expect(service.refresh(FAKE_DB, 'acme', 'revoked-token')).rejects.toThrow(AuthenticationError);
    });

    it('rejects an expired token', async () => {
      refreshTokens.findByHash.mockResolvedValue(activeTokenRecord({ expiresAt: new Date(Date.now() - 1000) }));
      await expect(service.refresh(FAKE_DB, 'acme', 'expired-token')).rejects.toThrow(AuthenticationError);
    });

    it('revokes the presented token even when the user turns out to be gone, then rejects', async () => {
      refreshTokens.findByHash.mockResolvedValue(activeTokenRecord());
      users.findById.mockResolvedValue(null);

      await expect(service.refresh(FAKE_DB, 'acme', 'some-token')).rejects.toThrow(AuthenticationError);
      expect(refreshTokens.revoke).toHaveBeenCalledWith(FAKE_DB, hashToken('some-token'));
    });

    it('rejects when the user has since been deactivated', async () => {
      refreshTokens.findByHash.mockResolvedValue(activeTokenRecord());
      users.findById.mockResolvedValue({ ...makeAuthUser(), isActive: false });

      await expect(service.refresh(FAKE_DB, 'acme', 'some-token')).rejects.toThrow(AuthenticationError);
    });

    it('rotates the token: revokes the old one and issues a fresh pair on success', async () => {
      refreshTokens.findByHash.mockResolvedValue(activeTokenRecord());
      users.findById.mockResolvedValue(makeAuthUser());
      roles.findById.mockResolvedValue(makeRole());

      const result = await service.refresh(FAKE_DB, 'acme', 'old-token');

      expect(refreshTokens.revoke).toHaveBeenCalledWith(FAKE_DB, hashToken('old-token'));
      expect(refreshTokens.create).toHaveBeenCalledWith(
        FAKE_DB,
        'user-1',
        hashToken(result.refreshToken),
        expect.any(Date),
      );
      expect(result.refreshToken).not.toBe('old-token');
      const payload = jwtService.verify(result.accessToken, { secret: TEST_JWT_SECRET });
      expect(payload).toMatchObject({ sub: 'user-1', schema: 'acme' });
    });
  });

  describe('logout()', () => {
    it('revokes the hash of the given refresh token', async () => {
      await service.logout(FAKE_DB, 'some-token');
      expect(refreshTokens.revoke).toHaveBeenCalledWith(FAKE_DB, hashToken('some-token'));
    });
  });
});
