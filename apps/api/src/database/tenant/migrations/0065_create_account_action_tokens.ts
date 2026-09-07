import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * account_action_tokens: one-time, hashed tokens backing two related
 * pre-auth flows added as part of the Settings/Users & Permissions
 * security-hardening pass (2026-09): "forgot password" and "invite a
 * new user to set their own password" (see claude/settings-module-audit.md
 * §2.3/§2.4). Both flows are structurally identical — generate a random
 * token, email it, redeem it once for a new password — so they share one
 * table distinguished by `purpose`, the same way `refresh_tokens` already
 * established the "store only a SHA-256 hash, never the raw token" and
 * "single-use, explicit revocation/consumption" patterns this reuses.
 *
 * `purpose` is a CHECK constraint, not a separate table per flow —
 * there is no per-purpose column or behavior difference at the schema
 * level, only in which service constructs the row and what happens on
 * redemption (AccountAccessService).
 */
const migration: TenantMigration = {
  name: '0065_create_account_action_tokens',
  async up(db) {
    await sql`
      CREATE TABLE account_action_tokens (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        purpose TEXT NOT NULL CHECK (purpose IN ('password_reset', 'invite')),
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT account_action_tokens_token_hash_unique UNIQUE (token_hash)
      )
    `.execute(db);

    await sql`CREATE INDEX account_action_tokens_user_idx ON account_action_tokens (user_id)`.execute(db);
  },
};

export default migration;
