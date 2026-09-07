import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { UserRepository, UserAuthRecord } from '../ports/user.repository';
import type { AccountActionTokenRepository } from '../ports/account-action-token.repository';
import type { RefreshTokenRepository } from '../ports/refresh-token.repository';
import type { AuditLogRepository } from '../ports/audit-log.repository';
import type { EmailSenderPort } from '../../../../shared/email/email-sender.port';
import type { AccountActionToken } from '../../domain/account-action-token.entity';
import { AuthenticationError, NotFoundError } from '../errors';
import { AccountAccessService } from './account-access.service';

jest.mock('bcryptjs', () => ({ hash: jest.fn(async (plain: string) => `hashed:${plain}`) }));
import * as bcrypt from 'bcryptjs';

const FAKE_DB = {} as Kysely<TenantDatabase>;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function makeAuthUser(overrides: Partial<UserAuthRecord> = {}): UserAuthRecord {
  return {
    id: 'user-1',
    email: 'user@example.com',
    fullName: 'A User',
    roleId: 'role-1',
    isActive: true,
    passwordHash: 'stored-hash',
    totpEnabled: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeToken(overrides: Partial<AccountActionToken> = {}): AccountActionToken {
  return {
    id: 'token-1',
    userId: 'user-1',
    purpose: 'password_reset',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    ...overrides,
  };
}

describe('AccountAccessService', () => {
  let users: jest.Mocked<UserRepository>;
  let tokens: jest.Mocked<AccountActionTokenRepository>;
  let refreshTokens: jest.Mocked<RefreshTokenRepository>;
  let auditLogs: jest.Mocked<AuditLogRepository>;
  let emailSender: jest.Mocked<EmailSenderPort>;
  let service: AccountAccessService;

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
    tokens = { create: jest.fn(), findValidByHash: jest.fn(), markUsed: jest.fn() };
    refreshTokens = { create: jest.fn(), findByHash: jest.fn(), revoke: jest.fn(), revokeAllForUser: jest.fn() };
    auditLogs = { record: jest.fn(), list: jest.fn() };
    emailSender = { send: jest.fn() };
    service = new AccountAccessService(users, tokens, refreshTokens, auditLogs, emailSender);
  });

  describe('requestPasswordReset()', () => {
    it('does nothing observable for an unknown email (no token, no email, no audit log)', async () => {
      users.findByEmailForAuth.mockResolvedValue(null);
      await service.requestPasswordReset(FAKE_DB, 'nobody@example.com');
      expect(tokens.create).not.toHaveBeenCalled();
      expect(emailSender.send).not.toHaveBeenCalled();
      expect(auditLogs.record).not.toHaveBeenCalled();
    });

    it('does nothing observable for an inactive user either (same anti-enumeration reasoning)', async () => {
      users.findByEmailForAuth.mockResolvedValue(makeAuthUser({ isActive: false }));
      await service.requestPasswordReset(FAKE_DB, 'user@example.com');
      expect(tokens.create).not.toHaveBeenCalled();
    });

    it('creates a password_reset token, emails it, and audits the request for an active user', async () => {
      users.findByEmailForAuth.mockResolvedValue(makeAuthUser());
      await service.requestPasswordReset(FAKE_DB, '  User@Example.com  ');

      expect(users.findByEmailForAuth).toHaveBeenCalledWith(FAKE_DB, 'user@example.com');
      expect(tokens.create).toHaveBeenCalledWith(FAKE_DB, 'user-1', expect.any(String), 'password_reset', expect.any(Date));
      expect(emailSender.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'user@example.com' }),
      );
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ userId: 'user-1', action: 'auth.password_reset_requested' }),
      );
    });
  });

  describe('sendInvite()', () => {
    it('throws NotFoundError for a missing user', async () => {
      users.findById.mockResolvedValue(null);
      await expect(service.sendInvite(FAKE_DB, 'missing', 'actor-1')).rejects.toThrow(NotFoundError);
      expect(tokens.create).not.toHaveBeenCalled();
    });

    it('creates an invite token, emails it, and audits it under the ACTOR (not the invitee)', async () => {
      users.findById.mockResolvedValue(makeAuthUser());
      await service.sendInvite(FAKE_DB, 'user-1', 'actor-1');

      expect(tokens.create).toHaveBeenCalledWith(FAKE_DB, 'user-1', expect.any(String), 'invite', expect.any(Date));
      expect(emailSender.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@example.com' }));
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ userId: 'actor-1', action: 'user.invited', entityId: 'user-1' }),
      );
    });
  });

  describe('consumeToken()', () => {
    it('rejects when no token matches either purpose', async () => {
      tokens.findValidByHash.mockResolvedValue(null);
      await expect(service.consumeToken(FAKE_DB, 'unknown-token', 'NewPassword123')).rejects.toThrow(
        AuthenticationError,
      );
      expect(users.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('checks password_reset before invite, and stops once a match is found', async () => {
      tokens.findValidByHash.mockResolvedValueOnce(makeToken({ purpose: 'password_reset' }));
      await service.consumeToken(FAKE_DB, 'some-token', 'NewPassword123');
      expect(tokens.findValidByHash).toHaveBeenCalledTimes(1);
      expect(tokens.findValidByHash).toHaveBeenCalledWith(FAKE_DB, hashToken('some-token'), 'password_reset');
    });

    it('falls back to the invite purpose when no password_reset token matches', async () => {
      tokens.findValidByHash.mockResolvedValueOnce(null).mockResolvedValueOnce(makeToken({ purpose: 'invite' }));
      await service.consumeToken(FAKE_DB, 'invite-token', 'NewPassword123');
      expect(tokens.findValidByHash).toHaveBeenNthCalledWith(2, FAKE_DB, hashToken('invite-token'), 'invite');
    });

    it('hashes and stores the new password, marks the token used, and revokes every refresh token', async () => {
      const record = makeToken({ id: 'token-9', userId: 'user-9', purpose: 'password_reset' });
      tokens.findValidByHash.mockResolvedValueOnce(record);

      await service.consumeToken(FAKE_DB, 'some-token', 'NewPassword123');

      expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword123', 12);
      expect(users.updatePasswordHash).toHaveBeenCalledWith(FAKE_DB, 'user-9', 'hashed:NewPassword123');
      expect(tokens.markUsed).toHaveBeenCalledWith(FAKE_DB, 'token-9');
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(FAKE_DB, 'user-9');
    });

    it('audits "auth.password_reset_completed" for a password_reset token', async () => {
      tokens.findValidByHash.mockResolvedValueOnce(makeToken({ purpose: 'password_reset' }));
      await service.consumeToken(FAKE_DB, 'some-token', 'NewPassword123');
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ action: 'auth.password_reset_completed' }),
      );
    });

    it('audits "user.invite_accepted" for an invite token', async () => {
      tokens.findValidByHash.mockResolvedValueOnce(null).mockResolvedValueOnce(makeToken({ purpose: 'invite' }));
      await service.consumeToken(FAKE_DB, 'invite-token', 'NewPassword123');
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ action: 'user.invite_accepted' }),
      );
    });
  });
});
