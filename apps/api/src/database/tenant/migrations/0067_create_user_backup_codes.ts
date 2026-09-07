import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Single-use 2FA recovery codes ("I lost my phone"), issued once when a
 * user confirms TOTP setup (TwoFactorService.confirmSetup) and consumed
 * at most once each (TwoFactorService.verifyLoginCode). Same
 * "store only a hash, single-use, explicit consumption" shape as
 * refresh_tokens/account_action_tokens — one row per code rather than a
 * single JSON/array column, so each code can be individually marked
 * used without a read-modify-write race on a shared column.
 */
const migration: TenantMigration = {
  name: '0067_create_user_backup_codes',
  async up(db) {
    await sql`
      CREATE TABLE user_backup_codes (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT user_backup_codes_code_hash_unique UNIQUE (code_hash)
      )
    `.execute(db);

    await sql`CREATE INDEX user_backup_codes_user_idx ON user_backup_codes (user_id)`.execute(db);
  },
};

export default migration;
