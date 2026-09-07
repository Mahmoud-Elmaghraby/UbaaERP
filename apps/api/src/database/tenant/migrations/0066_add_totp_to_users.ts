import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Optional per-user TOTP two-factor authentication (CLAUDE.md audit
 * §2.5 / claude/settings-module-audit.md, Task 8). `totp_secret_encrypted`
 * holds the AES-256-GCM-encrypted secret (SecretsEncryptionService — the
 * same shared kernel already used for Sales' eta_credentials.client_secret),
 * never plaintext. `totp_enabled` is a separate boolean rather than
 * "secret IS NOT NULL" because setup is two steps (see
 * TwoFactorService's class comment): a secret can exist in a PENDING
 * state (generated, not yet confirmed) without 2FA actually being
 * required at login.
 */
const migration: TenantMigration = {
  name: '0066_add_totp_to_users',
  async up(db) {
    await sql`
      ALTER TABLE users
        ADD COLUMN totp_secret_encrypted TEXT,
        ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT false
    `.execute(db);
  },
};

export default migration;
