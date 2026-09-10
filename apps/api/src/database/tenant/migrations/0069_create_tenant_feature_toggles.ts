import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * tenant_feature_toggles (claude/platform-flexibility-strategy.md,
 * "Layer 2" — tenant self-service control, on top of Layer 1's
 * Plan/PlanFeature ceiling in the public schema). One row per feature
 * key the tenant has explicitly toggled; feature_key mirrors the
 * FEATURE_KEYS catalog (../../../shared/plans/feature-catalog.ts) but is
 * NOT a foreign key to anything — the catalog is application-level, same
 * reasoning as permissions' fixed key list (users-permissions module).
 *
 * Deliberately NOT one boolean column per feature (unlike
 * accounting_settings' four named account columns) — this set grows
 * every time a new optional document-chain module is wired onto
 * PlanFeatureGuard, and a homogeneous key -> enabled row is the same
 * shape already chosen for Layer 1 (plan_features, public schema) for
 * exactly that reason. A new feature key needs zero migration here.
 *
 * Absence of a row means "enabled" — the fail-open default, same
 * philosophy as PlanResolverService's own comment: a tenant that has
 * never touched this module's toggle keeps today's unconditional
 * behavior. Only an explicit false row disables anything.
 */
const migration: TenantMigration = {
  name: '0069_create_tenant_feature_toggles',
  async up(db) {
    await sql`
      CREATE TABLE tenant_feature_toggles (
        feature_key TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
  },
};

export default migration;
