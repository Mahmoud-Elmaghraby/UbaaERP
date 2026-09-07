import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { UserRepository, UserAuthRecord, UserTotpState } from '../ports/user.repository';
import type { BackupCodeRepository } from '../ports/backup-code.repository';
import type { AuditLogRepository } from '../ports/audit-log.repository';
import type { SecretsEncryptionService } from '../../../../shared/crypto/secrets-encryption.service';
import type { TotpService } from './totp.service';
import { AuthenticationError, ConflictError, NotFoundError } from '../errors';
import { TwoFactorService } from './two-factor.service';

jest.mock('bcryptjs', () => ({ compare: jest.fn() }));
import * as bcrypt from 'bcryptjs';

const FAKE_DB = {} as Kysely<TenantDatabase>;

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

describe('TwoFactorService', () => {
  let users: jest.Mocked<UserRepository>;
  let backupCodes: jest.Mocked<BackupCodeRepository>;
  let auditLogs: jest.Mocked<AuditLogRepository>;
  let secrets: jest.Mocked<SecretsEncryptionService>;
  let totp: jest.Mocked<TotpService>;
  let service: TwoFactorService;

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
    backupCodes = { replaceAll: jest.fn(), consume: jest.fn(), deleteAllForUser: jest.fn() };
    auditLogs = { record: jest.fn(), list: jest.fn() };
    secrets = { encrypt: jest.fn(), decrypt: jest.fn() } as unknown as jest.Mocked<SecretsEncryptionService>;
    totp = { generateSecret: jest.fn(), buildOtpauthUri: jest.fn(), verifyCode: jest.fn() } as unknown as jest.Mocked<TotpService>;

    service = new TwoFactorService(users, backupCodes, auditLogs, secrets, totp);
  });

  describe('getStatus()', () => {
    it('reports enabled: true without ever exposing the secret', async () => {
      users.getTotpState.mockResolvedValue({ enabled: true, secretEncrypted: 'encrypted-blob' });

      const result = await service.getStatus(FAKE_DB, 'user-1');

      expect(result).toEqual({ enabled: true });
    });

    it('reports enabled: false when 2FA has never been set up', async () => {
      users.getTotpState.mockResolvedValue({ enabled: false, secretEncrypted: null });

      const result = await service.getStatus(FAKE_DB, 'user-1');

      expect(result).toEqual({ enabled: false });
    });
  });

  describe('initiateSetup()', () => {
    it('rejects when 2FA is already enabled', async () => {
      users.getTotpState.mockResolvedValue({ enabled: true, secretEncrypted: 'enc' });

      await expect(service.initiateSetup(FAKE_DB, 'user-1', 'owner@example.com')).rejects.toThrow(ConflictError);
      expect(users.setPendingTotpSecret).not.toHaveBeenCalled();
    });

    it('generates a secret, encrypts it, stores it as pending, and returns the plain secret + otpauth URI', async () => {
      users.getTotpState.mockResolvedValue({ enabled: false, secretEncrypted: null } as UserTotpState);
      totp.generateSecret.mockReturnValue('PLAINSECRET');
      secrets.encrypt.mockReturnValue('encrypted-blob');
      totp.buildOtpauthUri.mockReturnValue('otpauth://totp/example');

      const result = await service.initiateSetup(FAKE_DB, 'user-1', 'owner@example.com');

      expect(secrets.encrypt).toHaveBeenCalledWith('PLAINSECRET');
      expect(users.setPendingTotpSecret).toHaveBeenCalledWith(FAKE_DB, 'user-1', 'encrypted-blob');
      expect(result).toEqual({ secret: 'PLAINSECRET', otpauthUri: 'otpauth://totp/example' });
    });
  });

  describe('confirmSetup()', () => {
    it('rejects when 2FA is already enabled', async () => {
      users.getTotpState.mockResolvedValue({ enabled: true, secretEncrypted: 'enc' });

      await expect(service.confirmSetup(FAKE_DB, 'user-1', '123456')).rejects.toThrow(ConflictError);
    });

    it('rejects when no setup is in progress (no pending secret)', async () => {
      users.getTotpState.mockResolvedValue({ enabled: false, secretEncrypted: null });

      await expect(service.confirmSetup(FAKE_DB, 'user-1', '123456')).rejects.toThrow(ConflictError);
    });

    it('rejects an invalid code without enabling 2FA or issuing backup codes', async () => {
      users.getTotpState.mockResolvedValue({ enabled: false, secretEncrypted: 'encrypted-blob' });
      secrets.decrypt.mockReturnValue('PLAINSECRET');
      totp.verifyCode.mockReturnValue(false);

      await expect(service.confirmSetup(FAKE_DB, 'user-1', '000000')).rejects.toThrow(AuthenticationError);
      expect(users.enableTotp).not.toHaveBeenCalled();
      expect(backupCodes.replaceAll).not.toHaveBeenCalled();
    });

    it('enables 2FA, issues 8 backup codes, audits, and returns the plaintext codes on a valid code', async () => {
      users.getTotpState.mockResolvedValue({ enabled: false, secretEncrypted: 'encrypted-blob' });
      secrets.decrypt.mockReturnValue('PLAINSECRET');
      totp.verifyCode.mockReturnValue(true);

      const result = await service.confirmSetup(FAKE_DB, 'user-1', '123456');

      expect(users.enableTotp).toHaveBeenCalledWith(FAKE_DB, 'user-1');
      expect(result.backupCodes).toHaveLength(8);
      // Format: 4 hex chars, dash, 4 hex chars.
      result.backupCodes.forEach((code) => expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/));
      // All codes are distinct.
      expect(new Set(result.backupCodes).size).toBe(8);

      expect(backupCodes.replaceAll).toHaveBeenCalledWith(FAKE_DB, 'user-1', expect.any(Array));
      const storedHashes = backupCodes.replaceAll.mock.calls[0][2];
      expect(storedHashes).toHaveLength(8);
      // Hashes never equal the plaintext codes (they're SHA-256 hex digests).
      storedHashes.forEach((hash) => expect(result.backupCodes).not.toContain(hash));

      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ userId: 'user-1', action: 'user.2fa_enabled' }),
      );
    });
  });

  describe('disable()', () => {
    it('rejects when the user does not exist', async () => {
      users.findById.mockResolvedValue(null);

      await expect(service.disable(FAKE_DB, 'user-1', 'whatever')).rejects.toThrow(NotFoundError);
    });

    it('rejects an incorrect password without touching TOTP state', async () => {
      users.findById.mockResolvedValue(makeAuthUser());
      users.findByEmailForAuth.mockResolvedValue(makeAuthUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.disable(FAKE_DB, 'user-1', 'wrong')).rejects.toThrow(ConflictError);
      expect(users.disableTotp).not.toHaveBeenCalled();
      expect(backupCodes.deleteAllForUser).not.toHaveBeenCalled();
    });

    it('disables TOTP, deletes backup codes, and audits on a correct password', async () => {
      users.findById.mockResolvedValue(makeAuthUser());
      users.findByEmailForAuth.mockResolvedValue(makeAuthUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.disable(FAKE_DB, 'user-1', 'correct');

      expect(users.disableTotp).toHaveBeenCalledWith(FAKE_DB, 'user-1');
      expect(backupCodes.deleteAllForUser).toHaveBeenCalledWith(FAKE_DB, 'user-1');
      expect(auditLogs.record).toHaveBeenCalledWith(
        FAKE_DB,
        expect.objectContaining({ userId: 'user-1', action: 'user.2fa_disabled' }),
      );
    });
  });

  describe('verifyLoginCode()', () => {
    it('returns false when 2FA is not enabled for the user', async () => {
      users.getTotpState.mockResolvedValue({ enabled: false, secretEncrypted: null });

      const result = await service.verifyLoginCode(FAKE_DB, 'user-1', '123456');

      expect(result).toBe(false);
      expect(secrets.decrypt).not.toHaveBeenCalled();
    });

    it('returns true on a valid live TOTP code, without touching backup codes', async () => {
      users.getTotpState.mockResolvedValue({ enabled: true, secretEncrypted: 'encrypted-blob' });
      secrets.decrypt.mockReturnValue('PLAINSECRET');
      totp.verifyCode.mockReturnValue(true);

      const result = await service.verifyLoginCode(FAKE_DB, 'user-1', '123456');

      expect(result).toBe(true);
      expect(backupCodes.consume).not.toHaveBeenCalled();
    });

    it('falls back to a backup code when the TOTP code is wrong, and consumes it', async () => {
      users.getTotpState.mockResolvedValue({ enabled: true, secretEncrypted: 'encrypted-blob' });
      secrets.decrypt.mockReturnValue('PLAINSECRET');
      totp.verifyCode.mockReturnValue(false);
      backupCodes.consume.mockResolvedValue(true);

      const result = await service.verifyLoginCode(FAKE_DB, 'user-1', 'ab12-cd34');

      expect(result).toBe(true);
      expect(backupCodes.consume).toHaveBeenCalledWith(FAKE_DB, 'user-1', expect.any(String));
    });

    it('returns false when neither the TOTP code nor any backup code matches', async () => {
      users.getTotpState.mockResolvedValue({ enabled: true, secretEncrypted: 'encrypted-blob' });
      secrets.decrypt.mockReturnValue('PLAINSECRET');
      totp.verifyCode.mockReturnValue(false);
      backupCodes.consume.mockResolvedValue(false);

      const result = await service.verifyLoginCode(FAKE_DB, 'user-1', '000000');

      expect(result).toBe(false);
    });
  });
});
