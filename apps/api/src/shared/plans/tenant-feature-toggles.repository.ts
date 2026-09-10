import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import { isPostgresUniqueViolation } from '../errors/domain-errors';

export interface TenantFeatureToggleRecord {
  featureKey: string;
  enabled: boolean;
  updatedAt: Date;
}

/**
 * Layer 2 of the platform-flexibility design (claude/platform-
 * flexibility-strategy.md) — reads/writes tenant_feature_toggles
 * (migration 0069). Lives here in shared/plans/, not behind a
 * module-owned port+DI-token pair like a normal business-module
 * repository, because it's consumed by two different modules
 * (AuthService in users-permissions, FeatureTogglesController in
 * settings) — same reasoning PlanResolverService already established:
 * register once in the @Global() PlansModule, inject directly wherever
 * needed, no per-module re-wiring.
 *
 * Race-condition handling on setEnabled() mirrors
 * KyselyTenantSettingsRepository.getOrCreate() exactly: try the INSERT,
 * fall back to UPDATE on a unique-violation from a concurrent first
 * write for the same key, rather than a Kysely .onConflict() clause
 * (not used elsewhere in this codebase's Kysely repositories, so this
 * keeps the same, already-proven pattern instead of introducing a new
 * one).
 */
@Injectable()
export class TenantFeatureTogglesRepository {
  async list(db: Kysely<TenantDatabase>): Promise<TenantFeatureToggleRecord[]> {
    const rows = await db.selectFrom('tenant_feature_toggles').selectAll().execute();
    return rows.map((row) => ({
      featureKey: row.feature_key,
      enabled: row.enabled,
      updatedAt: row.updated_at,
    }));
  }

  /** The only thing PlanFeatureGuard / AuthService.issueTokens() actually
   * need — every key with an explicit `enabled = false` row. Absence of a
   * key here means "enabled" (fail-open default, see migration 0069's
   * own comment). */
  async listDisabledFeatureKeys(db: Kysely<TenantDatabase>): Promise<string[]> {
    const rows = await db
      .selectFrom('tenant_feature_toggles')
      .select('feature_key')
      .where('enabled', '=', false)
      .execute();
    return rows.map((row) => row.feature_key);
  }

  async setEnabled(
    db: Kysely<TenantDatabase>,
    featureKey: string,
    enabled: boolean,
  ): Promise<TenantFeatureToggleRecord> {
    const now = new Date();
    const existing = await db
      .selectFrom('tenant_feature_toggles')
      .selectAll()
      .where('feature_key', '=', featureKey)
      .executeTakeFirst();

    if (existing) {
      const updated = await db
        .updateTable('tenant_feature_toggles')
        .set({ enabled, updated_at: now })
        .where('feature_key', '=', featureKey)
        .returningAll()
        .executeTakeFirstOrThrow();
      return { featureKey: updated.feature_key, enabled: updated.enabled, updatedAt: updated.updated_at };
    }

    try {
      const created = await db
        .insertInto('tenant_feature_toggles')
        .values({ feature_key: featureKey, enabled, updated_at: now })
        .returningAll()
        .executeTakeFirstOrThrow();
      return { featureKey: created.feature_key, enabled: created.enabled, updatedAt: created.updated_at };
    } catch (err) {
      // Two concurrent setEnabled() calls for the same, never-before-
      // toggled key can both find no row and both try to INSERT — the
      // primary key makes the second one fail. Not an error: whoever
      // lost the race just re-applies their own value as an UPDATE,
      // same treatment as KyselyTenantSettingsRepository.getOrCreate().
      if (!isPostgresUniqueViolation(err)) throw err;
      const row = await db
        .updateTable('tenant_feature_toggles')
        .set({ enabled, updated_at: now })
        .where('feature_key', '=', featureKey)
        .returningAll()
        .executeTakeFirstOrThrow();
      return { featureKey: row.feature_key, enabled: row.enabled, updatedAt: row.updated_at };
    }
  }
}
