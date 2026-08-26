import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * refresh_tokens: backs JWT refresh-token rotation/revocation for the
 * auth flow (AuthService). Only a SHA-256 hash of the token is stored,
 * never the raw token — mirrors password-hash-at-rest practice. This
 * table (and the JWT-based auth flow it supports) is an implementation
 * decision, not something the master document specifies — it is silent
 * on the authentication mechanism entirely.
 */
const migration: TenantMigration = {
  name: '0014_create_refresh_tokens',
  async up(db) {
    await sql`
      CREATE TABLE refresh_tokens (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT refresh_tokens_token_hash_unique UNIQUE (token_hash)
      )
    `.execute(db);

    await sql`CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id)`.execute(db);
  },
};

export default migration;
