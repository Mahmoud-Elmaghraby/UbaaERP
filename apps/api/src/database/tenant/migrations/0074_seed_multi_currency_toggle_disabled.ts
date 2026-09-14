import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Seeds one explicit `enabled: false` row into tenant_feature_toggles
 * (migration 0069) for FEATURE_KEYS.MULTI_CURRENCY ('multi_currency') —
 * see that key's own comment in feature-catalog.ts for why (including
 * why the key is flat 'multi_currency' rather than nested under
 * 'accounting.'). Every other feature key relies on 0069's
 * fail-open default (no row = enabled); this is the one deliberate
 * exception, because competitor research (claude/multi-currency-
 * strategy.md §9 — Odoo, ERPNext, SAP B1) found multi-currency is kept
 * dormant until a tenant turns it on, and most of this platform's own
 * tenants don't need it.
 *
 * Runs for every tenant schema — both already-provisioned ones (via the
 * normal batch migration runner) and brand-new ones (provisioning
 * applies every migration from scratch, per provisioning.service.ts's
 * own comment — "provisioning and migration share the same code path").
 * No existing tenant had any real foreign-currency usage before this
 * pass (multi-currency Phase 1/2 only just shipped), so this seed has no
 * user-visible effect on any tenant that hasn't touched this yet.
 *
 * ON CONFLICT DO NOTHING: idempotent against a tenant that has already
 * (somehow) toggled this key explicitly before this migration ran —
 * their explicit choice wins, this seed never overwrites it.
 */
const migration: TenantMigration = {
  name: '0074_seed_multi_currency_toggle_disabled',
  async up(db) {
    await sql`
      INSERT INTO tenant_feature_toggles (feature_key, enabled, updated_at)
      VALUES ('multi_currency', false, now())
      ON CONFLICT (feature_key) DO NOTHING
    `.execute(db);
  },
};

export default migration;
