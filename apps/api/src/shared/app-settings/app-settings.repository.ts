import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { APP_SETTINGS, type AppSettingKey, type AppSettingValue } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../database/tenant/kysely-client';

export interface StoredAppSetting {
  key: string;
  value: AppSettingValue;
  updatedAt: Date;
}

/**
 * The settings hub's store (app_settings, migration 0119). Global and read by any module: a
 * setting is configuration, not another module's business behaviour (same footing as the
 * feature-toggle repository). Writes go through Settings' AppSettingsService, which validates and
 * audits them.
 */
@Injectable()
export class AppSettingsRepository {
  async list(db: Kysely<TenantDatabase>): Promise<StoredAppSetting[]> {
    const rows = await db.selectFrom('app_settings').selectAll().execute();
    return rows.map((r) => ({ key: r.key, value: r.value as AppSettingValue, updatedAt: r.updated_at }));
  }

  /** The current value of one setting, or its default. */
  async get<K extends AppSettingKey>(db: Kysely<TenantDatabase>, key: K): Promise<(typeof APP_SETTINGS)[K]['default']> {
    const row = await db.selectFrom('app_settings').select('value').where('key', '=', key).executeTakeFirst();
    return (row ? row.value : APP_SETTINGS[key].default) as (typeof APP_SETTINGS)[K]['default'];
  }

  async set(db: Kysely<TenantDatabase>, key: string, value: AppSettingValue, userId: string): Promise<void> {
    await db
      .insertInto('app_settings')
      .values({ key, value: JSON.stringify(value), updated_by: userId })
      .onConflict((oc) => oc.column('key').doUpdateSet({ value: JSON.stringify(value), updated_by: userId, updated_at: sql`now()` }))
      .execute();
  }

  async reset(db: Kysely<TenantDatabase>, key: string): Promise<void> {
    await db.deleteFrom('app_settings').where('key', '=', key).execute();
  }
}
