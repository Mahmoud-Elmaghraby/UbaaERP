import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * eta_credentials (CLAUDE.md §8's mandatory Egyptian e-invoice
 * integration; see claude/sales-einvoice-spike.md, the spike done
 * before any Sales code per §10 step 4's blocking note).
 *
 * A tenant-level singleton, same enforced-at-the-DB shape as
 * `tenant_settings` (0001) — one row per tenant, `singleton` UNIQUE so a
 * second row can never be inserted. This is deliberately just
 * credential/config storage: no ETA API call is made anywhere in this
 * pass. The actual submission engine (state machine, ESealSigner port,
 * background dispatcher — see the spike doc's §6 architecture proposal)
 * attaches later, when Sales Invoices is built; this table exists now so
 * a tenant administrator can already register their ETA client
 * credentials as soon as they have them, per the user's explicit
 * instruction to have this ready ahead of time rather than blocked on
 * real ETA registration data.
 *
 * `client_secret_encrypted` is never stored in plaintext — encrypted at
 * the application layer via SecretsEncryptionService
 * (apps/api/src/shared/crypto/) before this column is written, and never
 * decrypted back out through any API response (see EtaCredentialsService
 * / the contract's `clientSecretConfigured: boolean` instead of the
 * actual secret).
 *
 * `environment`: 'preprod' | 'production' — CLAUDE.md §8/the spike's §2
 * table of environment URLs. Defaults to 'preprod', the safe default (no
 * tenant should default into hitting the real production ETA API).
 * `document_version`: ETA document schema version ('0.9' preprod,
 * '1.0' production per the spike's §4 finding) — a plain string, not an
 * enum, since ETA's own versioning isn't fixed to just these two values
 * long-term.
 *
 * Permission: reuses 'sales.manage' (seeded by 0039) — no new permission
 * needed for a settings-shaped sub-resource of the same module, same as
 * TenantSettingsController reuses a Settings-module permission rather
 * than minting one per settings screen.
 */
const migration: TenantMigration = {
  name: '0040_create_eta_credentials',
  async up(db) {
    await sql`
      CREATE TABLE eta_credentials (
        id UUID PRIMARY KEY,
        singleton BOOLEAN NOT NULL DEFAULT TRUE,
        client_id TEXT,
        client_secret_encrypted TEXT,
        tax_registration_number TEXT,
        environment TEXT NOT NULL DEFAULT 'preprod',
        document_version TEXT NOT NULL DEFAULT '0.9',
        is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT eta_credentials_singleton_check CHECK (singleton = TRUE),
        CONSTRAINT eta_credentials_singleton_unique UNIQUE (singleton),
        CONSTRAINT eta_credentials_environment_valid CHECK (environment IN ('preprod', 'production'))
      )
    `.execute(db);
  },
};

export default migration;
