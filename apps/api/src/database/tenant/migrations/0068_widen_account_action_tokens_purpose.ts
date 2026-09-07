import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Widens account_action_tokens.purpose to also allow 'mfa_challenge' —
 * the short-lived (5 min), single-use ticket AuthService issues after a
 * correct password when the user has TOTP enabled, and redeems in
 * AuthService.verifyTwoFactor() once the correct code is presented. This
 * reuses the table (and its existing hashed/single-use/expiring
 * guarantees) rather than inventing a third token mechanism — see
 * migration 0065's own comment for why 'password_reset'/'invite'
 * already share it.
 *
 * The constraint being dropped is the one migration 0065 created
 * inline (`purpose TEXT NOT NULL CHECK (...)`) without an explicit
 * name — Postgres deterministically names an unnamed single-column
 * CHECK constraint `<table>_<column>_check`, so this targets
 * `account_action_tokens_purpose_check` by that convention rather than
 * guessing or querying pg_constraint at migration time.
 */
const migration: TenantMigration = {
  name: '0068_widen_account_action_tokens_purpose',
  async up(db) {
    await sql`
      ALTER TABLE account_action_tokens
        DROP CONSTRAINT account_action_tokens_purpose_check
    `.execute(db);

    await sql`
      ALTER TABLE account_action_tokens
        ADD CONSTRAINT account_action_tokens_purpose_check
        CHECK (purpose IN ('password_reset', 'invite', 'mfa_challenge'))
    `.execute(db);
  },
};

export default migration;
